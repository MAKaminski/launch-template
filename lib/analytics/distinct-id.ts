import { env } from "@/lib/env";

/**
 * Recovering the browser's PostHog distinct_id on the server.
 *
 * This is the part most templates get wrong, and it is why funnels break at the
 * payment boundary: the browser fires `checkout_started` as person A, then the
 * Stripe webhook fires `purchase_completed` as a freshly-generated person B, and
 * the conversion never links up.
 *
 * posthog-js persists its state in a cookie named `ph_<projectApiKey>_posthog`
 * whose value is URL-encoded JSON containing `distinct_id`. We read it in the
 * route handler, thread it through Stripe/Cal `metadata`, and hand it back to
 * posthog-node at webhook time. Full flow documented in docs/EVENTS.md.
 */

export function postHogCookieName(): string | null {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  return key ? `ph_${key}_posthog` : null;
}

/** Parses a distinct_id out of a raw posthog-js cookie value. */
export function parseDistinctId(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed: unknown = JSON.parse(decoded);
    if (parsed && typeof parsed === "object" && "distinct_id" in parsed) {
      const value = (parsed as { distinct_id: unknown }).distinct_id;
      return typeof value === "string" && value.length > 0 ? value : null;
    }
    return null;
  } catch {
    // A malformed or partially-written cookie is not an error worth surfacing;
    // we simply fall back to an anonymous server-side id.
    return null;
  }
}

/**
 * Reads the distinct_id from an incoming request's cookie header.
 * Works in both route handlers and middleware without importing next/headers.
 */
export function distinctIdFromCookieHeader(cookieHeader: string | null): string | null {
  const name = postHogCookieName();
  if (!name || !cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return parseDistinctId(part.slice(index + 1).trim());
  }
  return null;
}

/**
 * Last-resort identifier when the visitor has no PostHog cookie (blocked
 * script, first-touch server render). Prefixed so these are easy to spot and
 * exclude in PostHog when auditing funnel drop-off.
 */
export function anonymousDistinctId(seed: string): string {
  return `anon_${seed}`;
}
