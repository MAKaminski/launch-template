import { describe, expect, it } from "vitest";

import { anonymousDistinctId, parseDistinctId } from "@/lib/analytics/distinct-id";

/**
 * These cover the seam where funnels normally break: recovering the browser's
 * PostHog distinct_id server-side so `purchase_completed` lands on the same
 * person as `checkout_started`.
 */
describe("parseDistinctId", () => {
  it("extracts distinct_id from a URL-encoded posthog-js cookie", () => {
    const cookie = encodeURIComponent(
      JSON.stringify({ distinct_id: "0190-abc-def", $sesid: [1, "x", 2] }),
    );
    expect(parseDistinctId(cookie)).toBe("0190-abc-def");
  });

  it("handles an un-encoded cookie value", () => {
    expect(parseDistinctId(JSON.stringify({ distinct_id: "plain-id" }))).toBe("plain-id");
  });

  it("returns null for undefined", () => {
    expect(parseDistinctId(undefined)).toBeNull();
  });

  it("returns null for malformed JSON instead of throwing", () => {
    // A partially-written cookie must degrade, not take down the route handler.
    expect(parseDistinctId("{not json")).toBeNull();
    expect(parseDistinctId("%7Bbroken")).toBeNull();
  });

  it("returns null when distinct_id is missing, empty or not a string", () => {
    expect(parseDistinctId(JSON.stringify({ other: "x" }))).toBeNull();
    expect(parseDistinctId(JSON.stringify({ distinct_id: "" }))).toBeNull();
    expect(parseDistinctId(JSON.stringify({ distinct_id: 42 }))).toBeNull();
    expect(parseDistinctId(JSON.stringify({ distinct_id: null }))).toBeNull();
  });

  it("returns null for a JSON array payload", () => {
    expect(parseDistinctId(JSON.stringify(["distinct_id"]))).toBeNull();
  });
});

describe("anonymousDistinctId", () => {
  it("prefixes so fallback ids are filterable in PostHog", () => {
    expect(anonymousDistinctId("cs_test_123")).toBe("anon_cs_test_123");
  });

  it("is deterministic for the same seed", () => {
    expect(anonymousDistinctId("seed")).toBe(anonymousDistinctId("seed"));
  });
});
