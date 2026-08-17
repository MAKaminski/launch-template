import "server-only";

import Stripe from "stripe";

import { launchConfig } from "@/launch.config";

import { env, integrations, isProduction, warnOnce, logPrefix } from "@/lib/env";

let cached: Stripe | null = null;

/**
 * Server-side Stripe client.
 *
 * Refuses to initialise with a live key outside production. Pointing a dev or
 * preview deployment at live mode is the kind of mistake that charges real
 * cards, and it is trivially preventable here.
 */
export function getStripe(): Stripe | null {
  if (cached) return cached;

  const secretKey = env.STRIPE_SECRET_KEY;

  if (!integrations.stripe.configured || !secretKey) {
    warnOnce("Stripe", "set STRIPE_SECRET_KEY in .env.local. Checkout is disabled.");
    return null;
  }

  if (secretKey.startsWith("sk_live_") && !isProduction) {
    throw new Error(
      `${logPrefix} Refusing to start: a LIVE Stripe key (sk_live_...) is set while ` +
        `NODE_ENV is "${env.NODE_ENV}". Use a test key (sk_test_...) outside production.`,
    );
  }

  cached = new Stripe(secretKey, {
    // Pinned so a Stripe-side API rollout can never silently change behaviour.
    // Must match the version stripe@22.5.0 was generated against.
    apiVersion: "2026-07-29.dahlia",
    typescript: true,
    appInfo: { name: launchConfig.slug },
  });

  return cached;
}

export function isLiveMode(): boolean {
  return env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
}
