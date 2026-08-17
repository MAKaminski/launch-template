export {};

declare global {
  /**
   * Process-wide dedupe set for `warnOnce` in lib/env.ts. Lives on globalThis
   * so Next's several module graphs share one instance.
   */
  var __launchTemplateWarned: Set<string> | undefined;

  interface Window {
    /**
     * Event names mirrored by the `before_send` hook in
     * lib/analytics/posthog-client.ts. Populated only when
     * NEXT_PUBLIC_ANALYTICS_TEST_HOOK=1, which the Playwright smoke test sets.
     * Never present in a production build.
     */
    __capturedEvents?: string[];
  }
}
