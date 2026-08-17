/**
 * THE event taxonomy. Single source of truth.
 *
 * Every analytics event in this app is declared here, with its payload shape.
 * `track()` and `trackServer()` are the only functions permitted to reach
 * `posthog.capture()`; an ESLint `no-restricted-syntax` rule (see
 * eslint.config.mjs) fails the build on any raw `.capture()` call elsewhere.
 * Adding an event means adding it to `EventPayloads` — there is no other way in.
 */

/** Properties attached to every event, everywhere, via PostHog super properties. */
export interface SuperProperties {
  launch_slug: string;
  launch_name: string;
  app_env: "production" | "preview" | "development";
}

export interface EventPayloads {
  /**
   * Emitted on every App Router route change.
   *
   * Deliberately mapped onto PostHog's built-in `$pageview` rather than sent as
   * a distinct event — PostHog's web analytics, funnels, path analysis and
   * session replay all key off `$pageview`. A separate `page_viewed` event
   * would either break those features or double every pageview against the
   * shared event quota. See docs/DECISIONS.md.
   */
  page_viewed: {
    path: string;
    referrer: string | null;
  };

  cta_clicked: {
    cta_id: string;
    location: string;
  };

  lead_submitted: {
    /** Domain only. The raw address is never sent to analytics. */
    email_domain: string;
    source: string;
  };

  pricing_viewed: {
    plan_ids: string[];
  };

  checkout_started: {
    price_id: string;
    amount_cents: number;
    plan_key: string;
  };

  /** Server-side, from the Stripe webhook. */
  purchase_completed: {
    amount_cents: number;
    currency: string;
    stripe_customer_id: string | null;
    stripe_session_id: string;
  };

  booking_started: {
    event_type: string;
  };

  /** Server-side, from the Cal.com webhook. */
  booking_completed: {
    event_type: string;
    start_time: string;
    cal_booking_uid: string;
  };

  scroll_depth_reached: {
    /** Fires once per threshold per page view. */
    depth: 25 | 50 | 75 | 100;
    path: string;
  };

  outbound_link_clicked: {
    href: string;
    host: string;
    text: string | null;
  };
}

export type EventName = keyof EventPayloads;

/**
 * PostHog reserves `$`-prefixed names for its own events. `page_viewed` is an
 * alias onto `$pageview`; everything else is sent under its own name.
 */
const RESERVED_NAME_MAP: Partial<Record<EventName, string>> = {
  page_viewed: "$pageview",
};

export function toPostHogEventName(event: EventName): string {
  return RESERVED_NAME_MAP[event] ?? event;
}

const EVENT_NAMES: ReadonlySet<string> = new Set<EventName>([
  "page_viewed",
  "cta_clicked",
  "lead_submitted",
  "pricing_viewed",
  "checkout_started",
  "purchase_completed",
  "booking_started",
  "booking_completed",
  "scroll_depth_reached",
  "outbound_link_clicked",
]);

/**
 * Runtime guard for the closed union. Compile-time typing covers our own call
 * sites; this catches event names arriving from outside the type system —
 * webhook payloads, tests, and anything read from the wire.
 */
export function isEventName(value: unknown): value is EventName {
  return typeof value === "string" && EVENT_NAMES.has(value);
}

export function listEventNames(): EventName[] {
  return [...EVENT_NAMES] as EventName[];
}

/** Extracts the domain from an email without ever retaining the local part. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "unknown" : email.slice(at + 1).toLowerCase();
}
