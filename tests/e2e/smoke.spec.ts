import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test: home → pricing → click CTA → assert `checkout_started` fired.
 *
 * PostHog is mocked at two levels. Every `/ingest/**` request is fulfilled
 * locally so nothing reaches the network, and the SDK's `before_send` hook
 * mirrors event names onto `window.__capturedEvents` (enabled by
 * NEXT_PUBLIC_ANALYTICS_TEST_HOOK, set in playwright.config.ts). The hook is
 * needed because posthog-js gzips request bodies, so a network intercept alone
 * cannot read the event name.
 */

async function mockAnalytics(page: Page): Promise<void> {
  await page.route("**/ingest/**", (route) => {
    // posthog-js bootstraps by <script>-loading a remote config from
    // /ingest/array/<key>/config.js. Answering that with JSON throws a
    // SyntaxError in the page, so serve valid (empty) JavaScript instead.
    if (route.request().url().endsWith(".js")) {
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "/* mocked posthog remote config */",
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: 1 }),
    });
  });
}

async function capturedEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__capturedEvents ?? []);
}

test.beforeEach(async ({ page }) => {
  await mockAnalytics(page);
});

test("home → pricing → CTA fires checkout_started", async ({ page }) => {
  // Intercept checkout so no Stripe call is made and the browser is not
  // redirected away mid-assertion.
  let checkoutBody: unknown = null;
  await page.route("**/api/checkout", async (route) => {
    checkoutBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // Same-origin URL so the redirect stays inside the test.
      body: JSON.stringify({ url: "/thanks?session_id=cs_test_smoke" }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // PostHog needs a moment to initialise before the first event lands.
  await expect.poll(() => capturedEvents(page)).toContain("$pageview");

  await page.getByRole("link", { name: "See pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);

  await expect.poll(() => capturedEvents(page)).toContain("cta_clicked");
  await expect.poll(() => capturedEvents(page)).toContain("pricing_viewed");

  const starter = page.getByRole("button", { name: /Choose Starter/i });
  await expect(starter).toBeEnabled();
  await starter.click();

  // The assertion the whole test exists for.
  await expect.poll(() => capturedEvents(page)).toContain("checkout_started");

  // And the client sent only a plan key — never a price or an amount.
  expect(checkoutBody).toMatchObject({ planKey: "starter" });
  expect(checkoutBody).not.toHaveProperty("amount_cents");
  expect(checkoutBody).not.toHaveProperty("priceId");
});

test("every page renders and pageviews fire on client-side navigation", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => capturedEvents(page)).toContain("$pageview");

  // App Router client-side nav does not reload the document, which is exactly
  // why pageview capture is manual. This asserts it still fires.
  for (const [name, pattern] of [
    ["About", /\/about$/],
    ["FAQ", /\/faq$/],
    ["Pricing", /\/pricing$/],
    ["Book a call", /\/book$/],
  ] as const) {
    await page.getByRole("navigation").getByRole("link", { name }).click();
    await expect(page).toHaveURL(pattern);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  const events = await capturedEvents(page);
  expect(events.filter((event) => event === "$pageview").length).toBeGreaterThan(1);
});

test("outbound link clicks are captured", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const anchor = document.createElement("a");
    anchor.href = "https://example.com/external";
    anchor.textContent = "External";
    anchor.id = "test-outbound";

    // The tracker listens on `document` in the CAPTURE phase, so it runs before
    // this target-phase handler. Cancelling here stops the navigation that
    // would otherwise tear down the page — and window.__capturedEvents with it —
    // before the assertion below could read it.
    anchor.addEventListener("click", (event) => event.preventDefault());

    document.body.append(anchor);
  });

  await page.locator("#test-outbound").click();

  await expect.poll(() => capturedEvents(page)).toContain("outbound_link_clicked");
});

test("/api/health reports integration status", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as {
    ok: boolean;
    integrations: Record<string, { configured: boolean }>;
  };

  expect(body.ok).toBe(true);
  // Supabase, Stripe and Cal get no credentials from playwright.config.ts, so
  // they must all report themselves unconfigured rather than erroring.
  expect(body.integrations.supabase?.configured).toBe(false);
  expect(body.integrations.stripe?.configured).toBe(false);
  expect(body.integrations.cal?.configured).toBe(false);
});
