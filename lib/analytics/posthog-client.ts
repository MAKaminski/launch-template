"use client";

import posthog from "posthog-js";

import { launchConfig } from "@/launch.config";
import { appEnv, env, integrations, warnOnce } from "@/lib/env";

import type { EventName, EventPayloads } from "./events";
import { toPostHogEventName } from "./events";

let initialized = false;

/**
 * Initialises posthog-js exactly once.
 *
 * `api_host: "/ingest"` points the SDK at the Next.js rewrite defined in
 * next.config.ts rather than at posthog.com directly. That rewrite is the whole
 * reason ad blockers don't silently eat 20–40% of traffic — requests look
 * first-party. `ui_host` keeps the PostHog toolbar's links pointing at the real
 * dashboard, which would otherwise resolve to /ingest and 404.
 */
export function initPostHog(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!integrations.posthog.configured || !key) {
    warnOnce(
      "PostHog",
      "set NEXT_PUBLIC_POSTHOG_KEY in .env.local. All analytics calls are no-ops.",
    );
    return;
  }

  posthog.init(key, {
    api_host: "/ingest",
    ui_host: env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? "https://us.posthog.com",

    // Autocapture pageviews are unreliable with App Router client-side
    // navigation, so we capture them by hand in <AnalyticsProvider>.
    capture_pageview: false,
    capture_pageleave: true,

    person_profiles: "identified_only",

    // Example feature flag wiring. We ship zero flags; uncomment to bootstrap
    // one so the first render doesn't flicker while flags load:
    // bootstrap: { featureFlags: { "new-hero": "test" } },

  });

  // Super properties: attached to every event from this point on, including
  // ones fired by posthog-js itself. This is what makes a single shared PostHog
  // project sliceable per launch.
  posthog.register({
    launch_slug: launchConfig.slug,
    launch_name: launchConfig.name,
    app_env: appEnv,
  });
}

/**
 * The ONLY sanctioned way to emit an event from the browser.
 * Raw `posthog.capture()` calls elsewhere fail lint. See lib/analytics/events.ts.
 */
export function track<E extends EventName>(event: E, properties: EventPayloads[E]): void {
  if (!integrations.posthog.configured) return;

  const name = toPostHogEventName(event);

  // Opt-in test seam for the Playwright smoke test.
  //
  // Asserting on the network is not viable: posthog-js gzips its request
  // bodies, and it will not flush a capture until its remote-config bootstrap
  // resolves — which never happens when /ingest is mocked. Mirroring here is
  // both simpler and more accurate: `track()` is the only sanctioned way to
  // emit an event (enforced by the ESLint rule), so this observes exactly the
  // taxonomy. Off unless NEXT_PUBLIC_ANALYTICS_TEST_HOOK=1, so it is absent
  // from production builds.
  if (process.env.NEXT_PUBLIC_ANALYTICS_TEST_HOOK === "1" && typeof window !== "undefined") {
    window.__capturedEvents ??= [];
    window.__capturedEvents.push(name);
  }

  posthog.capture(name, properties);
}

/**
 * The browser's distinct_id, to be threaded through Stripe and Cal so that
 * server-side events land on the same person and the funnel doesn't break at
 * the payment boundary.
 */
export function getDistinctId(): string | null {
  if (!integrations.posthog.configured) return null;
  try {
    return posthog.get_distinct_id() ?? null;
  } catch {
    // get_distinct_id throws if called before init completes.
    return null;
  }
}

export { posthog };
