import { describe, expect, it } from "vitest";

import {
  emailDomain,
  isEventName,
  listEventNames,
  toPostHogEventName,
  type EventName,
} from "@/lib/analytics/events";

describe("event taxonomy", () => {
  it("accepts every name in the closed union", () => {
    for (const name of listEventNames()) {
      expect(isEventName(name)).toBe(true);
    }
  });

  it("rejects names outside the taxonomy", () => {
    expect(isEventName("checkout_complete")).toBe(false);
    expect(isEventName("Purchase Completed")).toBe(false);
    expect(isEventName("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isEventName(undefined)).toBe(false);
    expect(isEventName(null)).toBe(false);
    expect(isEventName(42)).toBe(false);
    expect(isEventName({ event: "cta_clicked" })).toBe(false);
  });

  it("ships exactly the documented taxonomy", () => {
    // Locks the taxonomy against accidental drift. Adding an event here is
    // intentional; the docs/EVENTS.md table must be updated to match.
    expect([...listEventNames()].sort()).toEqual(
      [
        "booking_completed",
        "booking_started",
        "checkout_started",
        "cta_clicked",
        "lead_submitted",
        "outbound_link_clicked",
        "page_viewed",
        "pricing_viewed",
        "purchase_completed",
        "scroll_depth_reached",
      ].sort(),
    );
  });

  it("maps page_viewed onto PostHog's built-in $pageview", () => {
    // Emitting a separate page_viewed event would break PostHog's native web
    // analytics and path analysis, or double-count against the shared quota.
    expect(toPostHogEventName("page_viewed")).toBe("$pageview");
  });

  it("passes every other event through under its own name", () => {
    const passthrough: EventName[] = [
      "cta_clicked",
      "lead_submitted",
      "pricing_viewed",
      "checkout_started",
      "purchase_completed",
      "booking_started",
      "booking_completed",
      "scroll_depth_reached",
      "outbound_link_clicked",
    ];
    for (const name of passthrough) {
      expect(toPostHogEventName(name)).toBe(name);
    }
  });

  it("never emits a reserved $-prefixed name by accident", () => {
    const mapped = listEventNames()
      .filter((name) => name !== "page_viewed")
      .map(toPostHogEventName);
    expect(mapped.every((name) => !name.startsWith("$"))).toBe(true);
  });
});

describe("emailDomain", () => {
  it("returns only the domain, never the local part", () => {
    expect(emailDomain("someone@example.com")).toBe("example.com");
  });

  it("lowercases the domain so it groups cleanly in PostHog", () => {
    expect(emailDomain("Someone@Example.COM")).toBe("example.com");
  });

  it("uses the last @ so plus-addressing and quoted locals still work", () => {
    expect(emailDomain("a@b@example.com")).toBe("example.com");
  });

  it("degrades to 'unknown' rather than leaking the raw input", () => {
    expect(emailDomain("not-an-email")).toBe("unknown");
  });
});
