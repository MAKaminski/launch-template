import { createHmac, timingSafeEqual } from "node:crypto";

import { launchConfig } from "@/launch.config";
import { env, integrations } from "@/lib/env";

/** "acme/intro-call" — what @calcom/embed-react expects as `calLink`. */
export function calLink(): string | null {
  if (!integrations.cal.configured) return null;
  return `${env.NEXT_PUBLIC_CAL_USERNAME}/${env.NEXT_PUBLIC_CAL_EVENT_SLUG}`;
}

export function calEventType(): string {
  return env.NEXT_PUBLIC_CAL_EVENT_SLUG ?? "unknown";
}

/**
 * Metadata threaded through the booking so the Cal webhook can attribute
 * `booking_completed` to the same PostHog person who opened the embed.
 */
export function calMetadata(distinctId: string | null): Record<string, string> {
  const metadata: Record<string, string> = { launch_slug: launchConfig.slug };
  if (distinctId) metadata.posthog_distinct_id = distinctId;
  return metadata;
}

/**
 * Verifies Cal.com's `x-cal-signature-256` header: HMAC-SHA256 of the raw
 * request body, keyed by the webhook secret, hex-encoded.
 *
 * Compared with `timingSafeEqual` rather than `===` so the comparison cannot
 * leak the expected signature byte-by-byte through response timing.
 */
export function verifyCalSignature(rawBody: string, signature: string | null): boolean {
  const secret = env.CAL_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const received = signature.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  // timingSafeEqual throws on a length mismatch, so check that first.
  if (expectedBuffer.length === 0 || expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export type CalTriggerEvent =
  | "BOOKING_CREATED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED";

export interface CalWebhookPayload {
  triggerEvent: string;
  createdAt?: string;
  payload?: {
    uid?: string;
    bookingId?: number;
    title?: string;
    startTime?: string;
    endTime?: string;
    type?: string;
    status?: string;
    attendees?: Array<{ email?: string; name?: string }>;
    organizer?: { email?: string; name?: string };
    metadata?: Record<string, unknown>;
  };
}

const HANDLED: ReadonlySet<string> = new Set<CalTriggerEvent>([
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
]);

export function isHandledCalEvent(trigger: string): trigger is CalTriggerEvent {
  return HANDLED.has(trigger);
}

/** Maps a Cal trigger onto the `bookings.status` column. */
export function calStatusFor(trigger: CalTriggerEvent): string {
  switch (trigger) {
    case "BOOKING_CANCELLED":
      return "cancelled";
    case "BOOKING_RESCHEDULED":
      return "rescheduled";
    case "BOOKING_CREATED":
      return "confirmed";
  }
}
