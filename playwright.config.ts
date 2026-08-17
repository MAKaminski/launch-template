import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
// Must be `localhost`, not `127.0.0.1`. Next 16's dev server treats them as
// different origins and returns 403 for /_next/static/chunks/* requested from
// an origin outside `allowedDevOrigins` — which silently breaks every client
// component, including analytics, with no error beyond a failed chunk load.
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Runs against the dev server, so the smoke test needs no production build.
  // The env below is entirely fake: a dummy PostHog key so the SDK initialises,
  // the test hook so events are observable, and a dummy Price ID so the pricing
  // buttons are enabled. Every /ingest and /api/checkout call is intercepted in
  // the spec — nothing leaves the machine.
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_POSTHOG_KEY: "phc_playwright_smoke_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      NEXT_PUBLIC_ANALYTICS_TEST_HOOK: "1",
      NEXT_PUBLIC_PRICE_STARTER: "price_playwright_starter",
      NEXT_PUBLIC_PRICE_PRO: "price_playwright_pro",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
