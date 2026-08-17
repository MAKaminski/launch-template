import { NextResponse } from "next/server";

import { getPlan, launchConfig } from "@/launch.config";
import { distinctIdFromCookieHeader } from "@/lib/analytics/distinct-id";
import { siteUrl, logPrefix } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

interface CheckoutBody {
  planKey?: unknown;
  distinctId?: unknown;
}

/**
 * Creates a Stripe Checkout Session.
 *
 * The client sends a plan KEY, never a price or an amount. The server resolves
 * key → Price ID from launch.config.ts, so a tampered request can at worst pick
 * a different plan you already publish — it can never invent a price.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments are not configured for this launch." },
      { status: 503 },
    );
  }

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.planKey !== "string") {
    return NextResponse.json({ error: "planKey is required." }, { status: 400 });
  }

  const plan = getPlan(body.planKey);
  if (!plan) {
    return NextResponse.json({ error: `Unknown plan "${body.planKey}".` }, { status: 400 });
  }
  if (!plan.priceId) {
    return NextResponse.json(
      { error: `Plan "${plan.key}" has no Stripe Price ID configured yet.` },
      { status: 503 },
    );
  }

  // Prefer the id the browser reports; fall back to the cookie so checkout still
  // attributes correctly if the client-side SDK was blocked.
  const distinctId =
    (typeof body.distinctId === "string" && body.distinctId.length > 0 ? body.distinctId : null) ??
    distinctIdFromCookieHeader(request.headers.get("cookie"));

  const metadata: Record<string, string> = { launch_slug: launchConfig.slug, plan_key: plan.key };
  if (distinctId) metadata.posthog_distinct_id = distinctId;

  const mode = plan.interval === "one_time" ? "payment" : "subscription";

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: new URL(
        "/thanks?session_id={CHECKOUT_SESSION_ID}",
        siteUrl,
      ).toString(),
      cancel_url: new URL("/pricing", siteUrl).toString(),
      metadata,
      // The distinct_id must survive onto the object the webhook actually reads.
      // Stripe rejects payment_intent_data in subscription mode and vice versa,
      // so the key differs by mode.
      ...(mode === "payment"
        ? { payment_intent_data: { metadata } }
        : { subscription_data: { metadata } }),
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe returned no checkout URL." }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    console.error(`${logPrefix} checkout session creation failed:`, message);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
  }
}
