import { z } from "zod";

import { launchConfig } from "@/launch.config";

/**
 * Environment parsing.
 *
 * The single hardest constraint in this template is: `pnpm install && pnpm dev`
 * on a fresh clone with NO .env.local must start and render every page. That
 * rules out the usual `envSchema.parse(process.env)` at module scope, which
 * throws on first import and takes the whole app down.
 *
 * So: every variable is optional, we `safeParse`, and each integration exposes
 * an `isConfigured` boolean derived from whether its own vars are present.
 * Callers check that flag and fall back to a no-op.
 */

/**
 * A value counts as absent when it is missing, blank, or still a `TODO_`
 * placeholder.
 *
 * `pnpm init:launch` writes `.env.local` with every secret as `TODO_<NAME>`, so
 * that a freshly-initialised launch shows you exactly what remains to be filled
 * in. Without this check those placeholders are non-empty strings and therefore
 * read as *configured* — the app would then initialise Stripe with the literal
 * key "TODO_STRIPE_SECRET_KEY" and fail at the first real call, and /api/health
 * would cheerfully report everything as wired up.
 */
function isPlaceholder(value: string): boolean {
  return value.trim() === "" || value.trim().startsWith("TODO_");
}

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || isPlaceholder(v) ? undefined : v.trim()));

const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v === undefined || isPlaceholder(v) ? undefined : v.trim()))
  .refine((v) => v === undefined || URL.canParse(v), { message: "must be a valid URL" });

/**
 * NOTE on Next.js and `NEXT_PUBLIC_*`: the bundler performs a literal textual
 * substitution of `process.env.NEXT_PUBLIC_FOO`. It cannot substitute a dynamic
 * lookup like `process.env[key]`, so every public var must be written out in
 * full, exactly once, right here.
 */
const rawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,

  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,

  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_POSTHOG_UI_HOST: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST,
  POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,

  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_PROJECT_ID: process.env.SUPABASE_PROJECT_ID,

  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

  NEXT_PUBLIC_CAL_USERNAME: process.env.NEXT_PUBLIC_CAL_USERNAME,
  NEXT_PUBLIC_CAL_EVENT_SLUG: process.env.NEXT_PUBLIC_CAL_EVENT_SLUG,
  CAL_WEBHOOK_SECRET: process.env.CAL_WEBHOOK_SECRET,

  GOOGLE_SITE_VERIFICATION: process.env.GOOGLE_SITE_VERIFICATION,
  BING_SITE_VERIFICATION: process.env.BING_SITE_VERIFICATION,
  INDEXNOW_KEY: process.env.INDEXNOW_KEY,
} as const;

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),

  NEXT_PUBLIC_SITE_URL: optionalUrl,

  NEXT_PUBLIC_POSTHOG_KEY: optionalString,
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl,
  NEXT_PUBLIC_POSTHOG_UI_HOST: optionalUrl,
  POSTHOG_API_KEY: optionalString,

  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_PROJECT_ID: optionalString,

  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,

  NEXT_PUBLIC_CAL_USERNAME: optionalString,
  NEXT_PUBLIC_CAL_EVENT_SLUG: optionalString,
  CAL_WEBHOOK_SECRET: optionalString,

  GOOGLE_SITE_VERIFICATION: optionalString,
  BING_SITE_VERIFICATION: optionalString,
  INDEXNOW_KEY: optionalString,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses the environment without ever throwing.
 *
 * A malformed value (say, a non-URL in NEXT_PUBLIC_SITE_URL) drops just that
 * field rather than taking down the process — the relevant integration then
 * reports itself unconfigured, which is the correct degraded behaviour.
 */
export function parseEnv(source: Record<string, string | undefined> = rawEnv): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const salvaged: Record<string, string | undefined> = { ...source };
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") delete salvaged[key];
  }

  const retry = envSchema.safeParse(salvaged);
  return retry.success ? retry.data : envSchema.parse({});
}

export const env = parseEnv();

/** Which environment analytics should attribute events to. */
export const appEnv: "production" | "preview" | "development" =
  env.VERCEL_ENV ?? (env.NODE_ENV === "production" ? "production" : "development");

export const isProduction = env.NODE_ENV === "production";

export const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Log namespace. Uses the launch slug so that when several launches run side
 * by side — locally or in aggregated logs — every line says which one it came
 * from, instead of every launch claiming to be "launch-template".
 */
export const logPrefix = `[${launchConfig.slug}]`;

/**
 * Per-integration readiness. Each is true only when every var that integration
 * genuinely needs is present, so `/api/health` and the no-op stubs agree.
 */
export const integrations = {
  posthog: {
    configured: Boolean(env.NEXT_PUBLIC_POSTHOG_KEY),
    serverConfigured: Boolean(env.POSTHOG_API_KEY ?? env.NEXT_PUBLIC_POSTHOG_KEY),
  },
  supabase: {
    configured: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    adminConfigured: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
  },
  stripe: {
    configured: Boolean(env.STRIPE_SECRET_KEY),
    clientConfigured: Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    webhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
  },
  cal: {
    configured: Boolean(env.NEXT_PUBLIC_CAL_USERNAME && env.NEXT_PUBLIC_CAL_EVENT_SLUG),
    webhookConfigured: Boolean(env.CAL_WEBHOOK_SECRET),
  },
  indexnow: {
    configured: Boolean(env.INDEXNOW_KEY),
  },
} as const;

/**
 * One warning per integration, per process.
 *
 * React StrictMode double-renders, and Next evaluates this module separately in
 * each of its module graphs — server components, route handlers, and the SSR
 * pass of the client bundle. A module-scope `Set` therefore gets recreated
 * several times and the same warning prints three or four times, reading like a
 * bug.
 *
 * Parking the set on `globalThis` is the standard Next.js answer (it is why
 * database clients are cached there too): one instance per process, shared by
 * every module graph.
 */
const warned: Set<string> = (globalThis.__launchTemplateWarned ??= new Set<string>());

export function warnOnce(integration: string, message: string): void {
  if (warned.has(integration)) return;
  warned.add(integration);
  console.warn(`${logPrefix} ${integration} is not configured — ${message}`);
}

/** Test-only: lets the unit tests assert the once-only behaviour repeatedly. */
export function resetWarnings(): void {
  warned.clear();
}

/**
 * Announces every unconfigured integration once, at startup.
 *
 * Without this, warnings are purely lazy — Supabase only complains when a
 * client is first constructed, Stripe only on the first checkout — so a fresh
 * clone boots in near-silence and you have to hit /api/health to discover what
 * is missing. Called once per runtime from the root layout (server) and the
 * analytics provider (client).
 *
 * Uses the same keys as the lazy call sites, so an integration warns exactly
 * once per runtime no matter which path notices first.
 */
export function reportUnconfiguredIntegrations(): void {
  if (!integrations.posthog.configured) {
    warnOnce("PostHog", "set NEXT_PUBLIC_POSTHOG_KEY in .env.local. Analytics calls are no-ops.");
  }
  if (!integrations.supabase.configured) {
    warnOnce(
      "Supabase",
      "set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. Database calls are disabled.",
    );
  }
  if (!integrations.stripe.configured) {
    warnOnce("Stripe", "set STRIPE_SECRET_KEY in .env.local. Checkout is disabled.");
  }
  if (!integrations.cal.configured) {
    warnOnce(
      "Cal.com",
      "set NEXT_PUBLIC_CAL_USERNAME and NEXT_PUBLIC_CAL_EVENT_SLUG in .env.local. Booking is disabled.",
    );
  }
}
