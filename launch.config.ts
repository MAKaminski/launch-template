/**
 * Per-launch configuration — the source of truth for this launch's identity.
 *
 * `pnpm init:launch` rewrites this file. Everything here is public and safe to
 * bundle into the client; secrets live in .env.local and never appear here.
 *
 * `slug` is the join key across all three shared platforms:
 *   PostHog  → registered as the `launch_slug` super property on every event
 *   Supabase → the Postgres schema name, `launch_<slug>`
 *   Stripe   → `metadata.launch_slug` on Products, Sessions and PaymentIntents
 * Changing it after launch orphans your data in all three. Don't.
 */

export type PlanInterval = "one_time" | "month" | "year";

export interface PricingPlan {
  /** Stable key the client sends to /api/checkout. NEVER a price ID. */
  key: string;
  name: string;
  description: string;
  /**
   * Stripe Price ID (price_...). The server maps `key` → `priceId`; the client
   * never sends a price or an amount, so a tampered request cannot change what
   * is charged. Null until you create the Price — the button renders disabled.
   */
  priceId: string | null;
  /** Display only. Stripe is authoritative for what actually gets charged. */
  amountCents: number;
  currency: string;
  interval: PlanInterval;
  features: string[];
  highlighted?: boolean;
}

export interface LaunchConfig {
  slug: string;
  name: string;
  tagline: string;
  /** Bare hostname, no protocol. Null until a domain is attached. */
  domain: string | null;
  /** Which integrations this launch opted into at init time. */
  integrations: {
    posthog: boolean;
    supabase: boolean;
    stripe: boolean;
    cal: boolean;
    seo: boolean;
  };
  plans: PricingPlan[];
}

/**
 * Price IDs come straight from the environment rather than through lib/env
 * (which imports this file — the dependency only goes one way). `pnpm
 * init:launch` writes unset secrets as `TODO_<NAME>`, so those must read as
 * absent here too, or a plan renders an enabled button that fails at checkout.
 */
function priceId(value: string | undefined): string | null {
  if (!value || value.trim() === "" || value.startsWith("TODO_")) return null;
  return value.trim();
}

export const launchConfig: LaunchConfig = {
  slug: "launch-template",
  name: "Launch Template",
  tagline: "Stand up a new product idea in fifteen minutes.",
  domain: null,

  integrations: {
    posthog: true,
    supabase: true,
    stripe: true,
    cal: true,
    seo: true,
  },

  plans: [
    {
      key: "starter",
      name: "Starter",
      description: "Everything you need to validate the idea.",
      // Sourced from the environment because a Price ID differs between Stripe
      // test and live mode — committing one means editing this file every time
      // you switch. The client still only ever sends `key`; the server resolves
      // the Price ID here, so nothing about the trust boundary changes.
      priceId: priceId(process.env.NEXT_PUBLIC_PRICE_STARTER),
      amountCents: 4900,
      currency: "usd",
      interval: "one_time",
      features: ["Full access", "Email support", "Lifetime updates"],
    },
    {
      key: "pro",
      name: "Pro",
      description: "For when the idea is working and you want to push.",
      priceId: priceId(process.env.NEXT_PUBLIC_PRICE_PRO),
      amountCents: 9900,
      currency: "usd",
      interval: "month",
      features: ["Everything in Starter", "Priority support", "Onboarding call"],
      highlighted: true,
    },
  ],
};

/** Postgres schema for this launch. Matches the generated migration. */
export const dbSchema = `launch_${launchConfig.slug.replace(/-/g, "_")}`;

export function getPlan(key: string): PricingPlan | undefined {
  return launchConfig.plans.find((plan) => plan.key === key);
}

export default launchConfig;
