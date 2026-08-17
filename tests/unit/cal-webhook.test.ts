import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "cal_test_secret";

/**
 * lib/cal reads CAL_WEBHOOK_SECRET through lib/env at module load, so the env
 * has to be set before the import is evaluated. resetModules + dynamic import
 * gives each test a freshly-configured module.
 */
async function loadCal() {
  vi.resetModules();
  process.env.CAL_WEBHOOK_SECRET = SECRET;
  return import("@/lib/cal");
}

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

const BODY = JSON.stringify({
  triggerEvent: "BOOKING_CREATED",
  payload: { uid: "bk_123", type: "intro-call", startTime: "2026-09-01T10:00:00Z" },
});

describe("Cal webhook signature verification", () => {
  const original = process.env.CAL_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.CAL_WEBHOOK_SECRET = original;
    vi.resetModules();
  });

  it("accepts a correctly signed payload", async () => {
    const { verifyCalSignature } = await loadCal();
    expect(verifyCalSignature(BODY, sign(BODY))).toBe(true);
  });

  it("rejects a signature produced with the wrong secret", async () => {
    const { verifyCalSignature } = await loadCal();
    expect(verifyCalSignature(BODY, sign(BODY, "attacker_secret"))).toBe(false);
  });

  it("rejects a tampered body even when the signature is well-formed", async () => {
    const { verifyCalSignature } = await loadCal();
    const signature = sign(BODY);
    const tampered = BODY.replace("bk_123", "bk_999");
    expect(verifyCalSignature(tampered, signature)).toBe(false);
  });

  it("rejects a missing signature header", async () => {
    const { verifyCalSignature } = await loadCal();
    expect(verifyCalSignature(BODY, null)).toBe(false);
  });

  it("rejects an empty or garbage signature without throwing", async () => {
    const { verifyCalSignature } = await loadCal();
    // timingSafeEqual throws on length mismatch, so these must be guarded.
    expect(verifyCalSignature(BODY, "")).toBe(false);
    expect(verifyCalSignature(BODY, "zzzz")).toBe(false);
    expect(verifyCalSignature(BODY, "a".repeat(63))).toBe(false);
  });

  it("is case-insensitive about the hex signature", async () => {
    const { verifyCalSignature } = await loadCal();
    expect(verifyCalSignature(BODY, sign(BODY).toUpperCase())).toBe(true);
  });

  it("rejects everything when no secret is configured", async () => {
    vi.resetModules();
    delete process.env.CAL_WEBHOOK_SECRET;
    const { verifyCalSignature } = await import("@/lib/cal");
    // Fail closed: an unconfigured secret must never mean "accept all".
    expect(verifyCalSignature(BODY, sign(BODY))).toBe(false);
  });
});

describe("Cal event handling", () => {
  beforeEach(() => {
    process.env.CAL_WEBHOOK_SECRET = SECRET;
  });

  it("handles exactly the three documented triggers", async () => {
    const { isHandledCalEvent } = await loadCal();
    expect(isHandledCalEvent("BOOKING_CREATED")).toBe(true);
    expect(isHandledCalEvent("BOOKING_RESCHEDULED")).toBe(true);
    expect(isHandledCalEvent("BOOKING_CANCELLED")).toBe(true);
    expect(isHandledCalEvent("BOOKING_PAID")).toBe(false);
    expect(isHandledCalEvent("MEETING_STARTED")).toBe(false);
  });

  it("maps each trigger to its booking status", async () => {
    const { calStatusFor } = await loadCal();
    expect(calStatusFor("BOOKING_CREATED")).toBe("confirmed");
    expect(calStatusFor("BOOKING_RESCHEDULED")).toBe("rescheduled");
    expect(calStatusFor("BOOKING_CANCELLED")).toBe("cancelled");
  });
});
