import { afterEach, describe, expect, it, vi } from "vitest";

import { envSchema, parseEnv, resetWarnings, warnOnce } from "@/lib/env";

describe("env parsing", () => {
  afterEach(() => {
    resetWarnings();
    vi.restoreAllMocks();
  });

  it("parses an entirely empty environment without throwing", () => {
    // This is the whole zero-credential promise. If this test fails, a fresh
    // clone cannot boot.
    expect(() => parseEnv({})).not.toThrow();
  });

  it("defaults NODE_ENV to development when absent", () => {
    expect(parseEnv({}).NODE_ENV).toBe("development");
  });

  it("leaves every optional integration var undefined when absent", () => {
    const env = parseEnv({});
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.CAL_WEBHOOK_SECRET).toBeUndefined();
  });

  it("treats empty strings as absent rather than as valid values", () => {
    // Vercel hands through unset vars as "", which would otherwise read as
    // configured and produce an SDK init with a blank key.
    const env = parseEnv({ NEXT_PUBLIC_POSTHOG_KEY: "", STRIPE_SECRET_KEY: "   " });
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("trims surrounding whitespace from values", () => {
    expect(parseEnv({ STRIPE_SECRET_KEY: "  sk_test_123  " }).STRIPE_SECRET_KEY).toBe("sk_test_123");
  });

  it("treats TODO_ placeholders as absent", () => {
    // `pnpm init:launch` writes every unset secret as TODO_<NAME>. Read as
    // configured, the app would initialise Stripe with the literal string
    // "TODO_STRIPE_SECRET_KEY" and /api/health would report it all as wired up.
    const env = parseEnv({
      STRIPE_SECRET_KEY: "TODO_STRIPE_SECRET_KEY",
      NEXT_PUBLIC_POSTHOG_KEY: "TODO_NEXT_PUBLIC_POSTHOG_KEY",
      CAL_WEBHOOK_SECRET: "TODO_CAL_WEBHOOK_SECRET",
      INDEXNOW_KEY: "TODO_INDEXNOW_KEY",
    });

    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(env.CAL_WEBHOOK_SECRET).toBeUndefined();
    expect(env.INDEXNOW_KEY).toBeUndefined();
  });

  it("treats a TODO_ placeholder in a URL field as absent", () => {
    expect(parseEnv({ NEXT_PUBLIC_SITE_URL: "TODO_NEXT_PUBLIC_SITE_URL" }).NEXT_PUBLIC_SITE_URL)
      .toBeUndefined();
  });

  it("does not mistake a legitimate value that merely contains 'TODO'", () => {
    // Only a TODO_ *prefix* is a placeholder.
    expect(parseEnv({ STRIPE_SECRET_KEY: "sk_test_TODO_123" }).STRIPE_SECRET_KEY).toBe(
      "sk_test_TODO_123",
    );
  });

  it("drops a malformed URL instead of throwing the whole process", () => {
    const env = parseEnv({
      NEXT_PUBLIC_SITE_URL: "not-a-url",
      STRIPE_SECRET_KEY: "sk_test_123",
    });
    expect(env.NEXT_PUBLIC_SITE_URL).toBeUndefined();
    // The valid sibling must survive the salvage pass.
    expect(env.STRIPE_SECRET_KEY).toBe("sk_test_123");
  });

  it("keeps valid values intact", () => {
    const env = parseEnv({
      NEXT_PUBLIC_SITE_URL: "https://example.com",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_abc",
      NODE_ENV: "production",
    });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://example.com");
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBe("phc_abc");
    expect(env.NODE_ENV).toBe("production");
  });

  it("rejects an unknown NODE_ENV rather than passing it through", () => {
    expect(envSchema.safeParse({ NODE_ENV: "staging" }).success).toBe(false);
  });
});

describe("warnOnce", () => {
  afterEach(() => {
    resetWarnings();
    vi.restoreAllMocks();
  });

  it("logs only once per integration no matter how many times it is called", () => {
    // React StrictMode double-renders and Next re-evaluates modules across the
    // server/client boundary; without the guard this warning appears 3–4 times
    // and reads like a bug.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    warnOnce("Stripe", "no key");
    warnOnce("Stripe", "no key");
    warnOnce("Stripe", "no key");

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("still warns separately for each distinct integration", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    warnOnce("Stripe", "no key");
    warnOnce("Supabase", "no url");
    warnOnce("Cal", "no username");

    expect(spy).toHaveBeenCalledTimes(3);
  });
});
