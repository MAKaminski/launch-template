import "server-only";

import { PostHog } from "posthog-node";

import { launchConfig } from "@/launch.config";
import { appEnv, env, integrations, warnOnce, logPrefix } from "@/lib/env";

import type { EventName, EventPayloads } from "./events";
import { toPostHogEventName } from "./events";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;

  const key = env.POSTHOG_API_KEY ?? env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!integrations.posthog.serverConfigured || !key) {
    warnOnce(
      "PostHog",
      "set POSTHOG_API_KEY in .env.local. Server-side events are no-ops.",
    );
    return null;
  }

  client = new PostHog(key, {
    host: env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // Webhooks are short-lived: never buffer, and never wait on a timer.
    flushAt: 1,
    flushInterval: 0,
  });

  return client;
}

/**
 * Emits a server-side event and awaits delivery.
 *
 * Uses `captureImmediate()` rather than `capture()` + `flush()`: serverless
 * invocations can be frozen the moment the response is returned, and a buffered
 * event would simply never be sent. This awaits the HTTP round-trip.
 *
 * `distinctId` MUST be the browser's PostHog distinct_id, threaded through
 * Stripe/Cal metadata — see lib/analytics/distinct-id.ts. Passing anything else
 * creates a second person and breaks the funnel.
 */
export async function trackServer<E extends EventName>(
  event: E,
  distinctId: string,
  properties: EventPayloads[E],
): Promise<void> {
  const posthog = getClient();
  if (!posthog) return;

  try {
    await posthog.captureImmediate({
      distinctId,
      event: toPostHogEventName(event),
      properties: {
        ...properties,
        // Super properties are a browser-SDK concept; on the server we attach
        // them by hand so events from both sides are filterable identically.
        launch_slug: launchConfig.slug,
        launch_name: launchConfig.name,
        app_env: appEnv,
        $process_person_profile: true,
      },
    });
  } catch (error) {
    // Analytics must never take down a webhook. Stripe would retry a 500 and
    // we would double-process a payment over a dropped analytics packet.
    console.error(`${logPrefix} failed to capture server event`, event, error);
  }
}

export async function shutdownAnalytics(): Promise<void> {
  if (!client) return;
  await client.shutdown();
  client = null;
}
