import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The idempotency gate.
 *
 * Stripe and Cal both retry, and both can deliver the same event twice on
 * success. Without this gate a retry creates a second order row and a second
 * purchase_completed event. These tests model the unique constraint from
 * supabase/migrations/0001_*.sql in memory and assert the second delivery is a
 * no-op.
 */

const UNIQUE_VIOLATION = "23505";

interface LedgerRow {
  provider: string;
  external_id: string;
  payload: unknown;
  processed_at: string | null;
  error: string | null;
}

/**
 * Minimal fake enforcing UNIQUE (provider, external_id) — the same constraint
 * the migration declares.
 */
function createFakeSupabase() {
  const rows: LedgerRow[] = [];

  return {
    rows,
    from(table: string) {
      if (table !== "webhook_events") throw new Error(`unexpected table ${table}`);

      return {
        insert(row: { provider: string; external_id: string; payload: unknown }) {
          const clash = rows.some(
            (existing) =>
              existing.provider === row.provider && existing.external_id === row.external_id,
          );

          if (clash) {
            return Promise.resolve({
              error: { code: UNIQUE_VIOLATION, message: "duplicate key value" },
            });
          }

          rows.push({ ...row, processed_at: null, error: null });
          return Promise.resolve({ error: null });
        },

        update(patch: Partial<LedgerRow>) {
          const filters: Array<[string, string]> = [];
          const builder = {
            eq(column: string, value: string) {
              filters.push([column, value]);
              if (filters.length < 2) return builder;

              for (const row of rows) {
                const matches = filters.every(
                  ([key, expected]) => row[key as "provider" | "external_id"] === expected,
                );
                if (matches) Object.assign(row, patch);
              }
              return Promise.resolve({ error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

async function loadLedger(fake: ReturnType<typeof createFakeSupabase> | null) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake }));
  return import("@/lib/webhooks/ledger");
}

describe("webhook idempotency ledger", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("claims an unseen event as new", async () => {
    const fake = createFakeSupabase();
    const { claimWebhookEvent } = await loadLedger(fake);

    await expect(claimWebhookEvent("stripe", "evt_1", { a: 1 })).resolves.toBe("new");
    expect(fake.rows).toHaveLength(1);
  });

  it("returns duplicate on the second delivery of the same event", async () => {
    const fake = createFakeSupabase();
    const { claimWebhookEvent } = await loadLedger(fake);

    const first = await claimWebhookEvent("stripe", "evt_1", { a: 1 });
    const second = await claimWebhookEvent("stripe", "evt_1", { a: 1 });

    expect(first).toBe("new");
    expect(second).toBe("duplicate");
  });

  it("writes exactly ONE row when the same event arrives many times", async () => {
    // This is the assertion that matters: same event twice → one row.
    const fake = createFakeSupabase();
    const { claimWebhookEvent } = await loadLedger(fake);

    for (let i = 0; i < 5; i += 1) {
      await claimWebhookEvent("stripe", "evt_repeat", { attempt: i });
    }

    expect(fake.rows).toHaveLength(1);
  });

  it("treats concurrent deliveries as one winner and one duplicate", async () => {
    const fake = createFakeSupabase();
    const { claimWebhookEvent } = await loadLedger(fake);

    const results = await Promise.all([
      claimWebhookEvent("stripe", "evt_race", {}),
      claimWebhookEvent("stripe", "evt_race", {}),
    ]);

    expect(results.filter((r) => r === "new")).toHaveLength(1);
    expect(results.filter((r) => r === "duplicate")).toHaveLength(1);
    expect(fake.rows).toHaveLength(1);
  });

  it("scopes the key by provider, so identical ids from Stripe and Cal both pass", async () => {
    const fake = createFakeSupabase();
    const { claimWebhookEvent } = await loadLedger(fake);

    expect(await claimWebhookEvent("stripe", "shared_id", {})).toBe("new");
    expect(await claimWebhookEvent("cal", "shared_id", {})).toBe("new");
    expect(fake.rows).toHaveLength(2);
  });

  it("distinguishes Cal triggers for the same booking", async () => {
    // A create and a later cancel of one booking are different events; a retry
    // of either is not.
    const fake = createFakeSupabase();
    const { claimWebhookEvent } = await loadLedger(fake);

    expect(await claimWebhookEvent("cal", "bk_1:BOOKING_CREATED", {})).toBe("new");
    expect(await claimWebhookEvent("cal", "bk_1:BOOKING_CANCELLED", {})).toBe("new");
    expect(await claimWebhookEvent("cal", "bk_1:BOOKING_CREATED", {})).toBe("duplicate");
    expect(fake.rows).toHaveLength(2);
  });

  it("reports unavailable when Supabase is not configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { claimWebhookEvent } = await loadLedger(null);

    // Must not claim to be idempotent when there is no ledger to enforce it.
    await expect(claimWebhookEvent("stripe", "evt_1", {})).resolves.toBe("unavailable");
  });

  it("marks a claimed event processed", async () => {
    const fake = createFakeSupabase();
    const { claimWebhookEvent, markProcessed } = await loadLedger(fake);

    await claimWebhookEvent("stripe", "evt_ok", {});
    await markProcessed("stripe", "evt_ok");

    expect(fake.rows[0]?.processed_at).not.toBeNull();
    expect(fake.rows[0]?.error).toBeNull();
  });

  it("records a failure WITHOUT releasing the claim", async () => {
    const fake = createFakeSupabase();
    const { claimWebhookEvent, markFailed } = await loadLedger(fake);

    await claimWebhookEvent("stripe", "evt_bad", {});
    await markFailed("stripe", "evt_bad", "boom");

    expect(fake.rows[0]?.error).toBe("boom");
    expect(fake.rows[0]?.processed_at).toBeNull();

    // Still claimed: a retry must not re-run half-finished work.
    await expect(claimWebhookEvent("stripe", "evt_bad", {})).resolves.toBe("duplicate");
  });
});
