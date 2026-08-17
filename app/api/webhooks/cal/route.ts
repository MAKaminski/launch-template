import { NextResponse } from "next/server";

import { trackServer } from "@/lib/analytics/posthog-server";
import { anonymousDistinctId } from "@/lib/analytics/distinct-id";
import {
  calStatusFor,
  isHandledCalEvent,
  verifyCalSignature,
  type CalTriggerEvent,
  type CalWebhookPayload,
} from "@/lib/cal";
import { integrations, logPrefix } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { claimWebhookEvent, markFailed, markProcessed } from "@/lib/webhooks/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "cal";

export async function POST(request: Request) {
  if (!integrations.cal.webhookConfigured) {
    return NextResponse.json({ error: "Cal webhooks are not configured." }, { status: 503 });
  }

  // Raw body first: the HMAC is computed over these exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get("x-cal-signature-256");

  if (!verifyCalSignature(rawBody, signature)) {
    console.warn(`${logPrefix} rejected Cal webhook: bad signature`);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let body: CalWebhookPayload;
  try {
    body = JSON.parse(rawBody) as CalWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const trigger = body.triggerEvent;
  const uid = body.payload?.uid;

  if (!trigger || !uid) {
    return NextResponse.json({ error: "Missing triggerEvent or payload.uid." }, { status: 400 });
  }
  if (!isHandledCalEvent(trigger)) {
    // Acknowledge so Cal stops retrying an event we intentionally ignore.
    return NextResponse.json({ received: true, ignored: trigger });
  }

  // Cal has no per-delivery event id, so the idempotency key is the booking uid
  // plus the trigger: a create and a later cancel of the same booking are
  // genuinely different events, but a retry of either is not.
  const externalId = `${uid}:${trigger}`;

  const claim = await claimWebhookEvent(PROVIDER, externalId, body as unknown as Json);
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim === "unavailable") {
    console.error(`${logPrefix} ledger unavailable; skipping`, trigger, externalId);
    return NextResponse.json({ received: true, persisted: false });
  }

  try {
    await handleBooking(trigger, body);
    await markProcessed(PROVIDER, externalId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`${logPrefix} Cal webhook ${trigger} failed:`, message);
    await markFailed(PROVIDER, externalId, message);
  }

  return NextResponse.json({ received: true });
}

async function handleBooking(
  trigger: CalTriggerEvent,
  body: CalWebhookPayload,
): Promise<void> {
  const payload = body.payload ?? {};
  const uid = payload.uid ?? "";
  const attendee = payload.attendees?.[0];
  const email = attendee?.email ?? null;
  const eventType = payload.type ?? "unknown";
  const startTime = payload.startTime ?? null;

  const supabase = createAdminClient();
  if (supabase) {
    const { error } = await supabase.from("bookings").upsert(
      {
        cal_booking_uid: uid,
        email,
        event_type: eventType,
        start_time: startTime,
        end_time: payload.endTime ?? null,
        status: calStatusFor(trigger),
      },
      { onConflict: "cal_booking_uid" },
    );

    if (error) throw new Error(`bookings upsert failed: ${error.message}`);
  }

  // Only a newly created booking is a conversion. A reschedule or cancellation
  // updates the row but must not fire a second booking_completed.
  if (trigger !== "BOOKING_CREATED") return;

  const metadata = payload.metadata ?? {};
  const threaded = metadata.posthog_distinct_id;
  const distinctId =
    typeof threaded === "string" && threaded.length > 0
      ? threaded
      : anonymousDistinctId(uid);

  await trackServer("booking_completed", distinctId, {
    event_type: eventType,
    start_time: startTime ?? "",
    cal_booking_uid: uid,
  });
}
