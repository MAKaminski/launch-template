import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { anonymousDistinctId } from "@/lib/analytics/distinct-id";
import { trackServer } from "@/lib/analytics/posthog-server";
import { env, integrations, logPrefix } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { claimWebhookEvent, markFailed, markProcessed } from "@/lib/webhooks/ledger";

/**
 * `nodejs` is mandatory: signature verification needs the byte-exact raw body,
 * and we must not let any body parsing happen first.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const secret = env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !integrations.stripe.webhookConfigured || !secret) {
    return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 503 });
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  // Raw text, before anything can reinterpret it. JSON.parse-then-stringify
  // would reorder keys and invalidate the signature.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`${logPrefix} rejected Stripe webhook:`, message);
    // 400 is correct here: the request is not authentic, and Stripe should not
    // treat it as delivered.
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // ── Idempotency gate. Nothing above this line touches business state. ──
  const claim = await claimWebhookEvent(PROVIDER, event.id, event as unknown as Json);
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim === "unavailable") {
    // Without a ledger we cannot guarantee exactly-once, so we decline to
    // process rather than risk double-recording an order.
    console.error(`${logPrefix} ledger unavailable; skipping`, event.type, event.id);
    return NextResponse.json({ received: true, persisted: false });
  }

  try {
    await handleEvent(event);
    await markProcessed(PROVIDER, event.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`${logPrefix} Stripe webhook ${event.type} failed:`, message);
    await markFailed(PROVIDER, event.id, message);
    // Deliberately still 200. A 500 makes Stripe retry-storm an event that will
    // fail identically every time; the failure is recorded in webhook_events
    // for replay instead. See docs/DECISIONS.md.
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(event.data.object);
      break;

    case "payment_intent.succeeded":
      await onPaymentIntentSucceeded(event.data.object);
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await onSubscriptionChanged(event.data.object, event.type);
      break;

    default:
      // Unhandled types are still ledgered above, so enabling one later is
      // just a matter of adding a case.
      break;
  }
}

function customerIdOf(value: string | { id: string } | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.id;
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const supabase = createAdminClient();
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const stripeCustomerId = customerIdOf(session.customer);
  const amountCents = session.amount_total ?? 0;
  const currency = session.currency ?? "usd";

  let customerId: string | null = null;

  if (supabase && email) {
    const { data, error } = await supabase
      .from("customers")
      .upsert({ email, stripe_customer_id: stripeCustomerId }, { onConflict: "email" })
      .select("id")
      .single();

    if (error) throw new Error(`customers upsert failed: ${error.message}`);
    customerId = data?.id ?? null;
  }

  if (supabase) {
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    const { error } = await supabase.from("orders").upsert(
      {
        customer_id: customerId,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        amount_cents: amountCents,
        currency,
        status: session.payment_status === "paid" ? "paid" : (session.status ?? "pending"),
      },
      { onConflict: "stripe_session_id" },
    );

    if (error) throw new Error(`orders upsert failed: ${error.message}`);
  }

  // The distinct_id we planted at checkout time. Using it here is what keeps
  // checkout_started → purchase_completed a single funnel for one person.
  const distinctId =
    session.metadata?.posthog_distinct_id ?? anonymousDistinctId(session.id);

  await trackServer("purchase_completed", distinctId, {
    amount_cents: amountCents,
    currency,
    stripe_customer_id: stripeCustomerId,
    stripe_session_id: session.id,
  });
}

async function onPaymentIntentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) return;

  // Only ever an update: the order row is created by checkout.session.completed,
  // and the two events race. Inserting here would create a duplicate order.
  const { error } = await supabase
    .from("orders")
    .update({ status: "paid", stripe_payment_intent_id: intent.id })
    .eq("stripe_payment_intent_id", intent.id);

  if (error) throw new Error(`orders update failed: ${error.message}`);
}

async function onSubscriptionChanged(
  subscription: Stripe.Subscription,
  eventType: string,
): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) return;

  const stripeCustomerId = customerIdOf(subscription.customer);
  if (!stripeCustomerId) return;

  const status = eventType === "customer.subscription.deleted" ? "cancelled" : subscription.status;

  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("stripe_payment_intent_id", subscription.id);

  if (error) throw new Error(`subscription status update failed: ${error.message}`);
}
