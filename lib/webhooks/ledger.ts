import "server-only";

import { logPrefix } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

/**
 * The idempotency ledger, shared by every webhook provider.
 *
 * Stripe and Cal.com both retry on non-2xx, and both can deliver the same event
 * more than once even on success. Without a gate, a retry creates a second
 * `orders` row and a second `purchase_completed` event — duplicated revenue in
 * the dashboard and a customer who looks like they paid twice.
 *
 * The gate is a unique-constrained INSERT that runs BEFORE any business logic.
 * If the insert conflicts, this event has been seen and we return 200 straight
 * away. Because the claim and the check are the same atomic statement, two
 * concurrent deliveries cannot both win.
 */

/** `new` — first sighting, proceed. `duplicate` — already handled, stop. */
export type ClaimResult = "new" | "duplicate" | "unavailable";

const UNIQUE_VIOLATION = "23505";

export async function claimWebhookEvent(
  provider: string,
  externalId: string,
  payload: Json,
): Promise<ClaimResult> {
  const supabase = createAdminClient();
  if (!supabase) return "unavailable";

  const { error } = await supabase
    .from("webhook_events")
    .insert({ provider, external_id: externalId, payload });

  if (!error) return "new";

  // Postgres unique_violation: another delivery of this same event got here
  // first. That is a success condition, not a failure.
  if (error.code === UNIQUE_VIOLATION) return "duplicate";

  console.error(`${logPrefix} ledger insert failed for ${provider}/${externalId}`, error.message);
  return "unavailable";
}

export async function markProcessed(provider: string, externalId: string): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString(), error: null })
    .eq("provider", provider)
    .eq("external_id", externalId);

  if (error) {
    console.error(`${logPrefix} failed to mark webhook processed`, error.message);
  }
}

/**
 * Records why an event failed, without un-claiming it.
 *
 * We deliberately keep the ledger row: re-opening it would let the provider's
 * retry run the same half-finished work again. The row is the audit trail —
 * query `webhook_events where error is not null` to find events needing a
 * manual replay.
 */
export async function markFailed(
  provider: string,
  externalId: string,
  message: string,
): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("webhook_events")
    .update({ error: message.slice(0, 2000), processed_at: null })
    .eq("provider", provider)
    .eq("external_id", externalId);

  if (error) {
    console.error(`${logPrefix} failed to record webhook error`, error.message);
  }
}
