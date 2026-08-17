import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const WEBHOOK_SECRET = "whsec_test_secret";
const SECRET_KEY = "sk_test_123";

const EVENT_BODY = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", object: "checkout.session" } },
});

function signedHeader(payload: string, secret = WEBHOOK_SECRET): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

/**
 * Exercises the real route handler, not a reimplementation of it. Supabase is
 * mocked so nothing touches a network or a database.
 */
async function loadRoute() {
  vi.resetModules();
  process.env.STRIPE_SECRET_KEY = SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.stubEnv("NODE_ENV", "test");

  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
  vi.doMock("@/lib/analytics/posthog-server", () => ({
    trackServer: vi.fn(async () => undefined),
    shutdownAnalytics: vi.fn(async () => undefined),
  }));

  return import("@/app/api/webhooks/stripe/route");
}

function request(body: string, signature: string | null): Request {
  return new Request("https://example.com/api/webhooks/stripe", {
    method: "POST",
    headers: signature
      ? { "stripe-signature": signature, "content-type": "application/json" }
      : { "content-type": "application/json" },
    body,
  });
}

describe("Stripe webhook signature verification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("rejects a request with no stripe-signature header", async () => {
    const { POST } = await loadRoute();
    const response = await POST(request(EVENT_BODY, null));
    expect(response.status).toBe(400);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();

    const response = await POST(request(EVENT_BODY, signedHeader(EVENT_BODY, "whsec_wrong")));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid signature." });
  });

  it("rejects a body tampered with after signing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();

    // Signature is valid for the ORIGINAL body — this is the replay/tamper case.
    const signature = signedHeader(EVENT_BODY);
    const tampered = EVENT_BODY.replace("cs_test_1", "cs_test_evil");

    const response = await POST(request(tampered, signature));
    expect(response.status).toBe(400);
  });

  it("rejects a garbage signature header without throwing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();

    const response = await POST(request(EVENT_BODY, "t=1,v1=deadbeef"));
    expect(response.status).toBe(400);
  });

  it("accepts a correctly signed event", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();

    const response = await POST(request(EVENT_BODY, signedHeader(EVENT_BODY)));
    // 200 even though the ledger is unavailable (Supabase mocked to null):
    // the signature was valid, so Stripe must not be told to retry.
    expect(response.status).toBe(200);
  });
});

describe("Stripe client safety", () => {
  afterEach(() => {
    // NODE_ENV is readonly in TS's process.env typing; vi.stubEnv is the
    // supported way to override it and restore afterwards.
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses a live key outside production", async () => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_live_realmoney";
    vi.stubEnv("NODE_ENV", "development");

    const { getStripe } = await import("@/lib/stripe");
    // Pointing a dev deploy at live mode charges real cards. Fail loudly.
    expect(() => getStripe()).toThrow(/LIVE Stripe key/);
  });

  it("allows a test key outside production", async () => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    vi.stubEnv("NODE_ENV", "development");

    const { getStripe } = await import("@/lib/stripe");
    expect(getStripe()).not.toBeNull();
  });

  it("returns null when no key is set, rather than throwing", async () => {
    vi.resetModules();
    delete process.env.STRIPE_SECRET_KEY;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { getStripe } = await import("@/lib/stripe");
    expect(getStripe()).toBeNull();
  });
});
