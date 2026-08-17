"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { getDistinctId, initPostHog, posthog, track } from "@/lib/analytics/posthog-client";
import { integrations, reportUnconfiguredIntegrations } from "@/lib/env";
import { PostHogProvider as PostHogReactProvider } from "posthog-js/react";

const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const;

/**
 * Manual pageview capture.
 *
 * App Router client-side navigation does not trigger a document load, so
 * PostHog's automatic pageview capture misses every navigation after the first.
 * We disable it in posthog-client.ts and fire here instead, on pathname or
 * query change.
 *
 * `useSearchParams()` opts the subtree into client-side rendering, which is why
 * this sits behind its own <Suspense> boundary — otherwise the whole app would
 * be forced dynamic and lose static generation.
 */
function PageviewTracker(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    if (lastPath.current === path) return;
    lastPath.current = path;

    track("page_viewed", {
      path,
      referrer: typeof document !== "undefined" && document.referrer ? document.referrer : null,
    });
  }, [pathname, searchParams]);

  return null;
}

/** Scroll depth at 25/50/75/100%, fired once per threshold per page view. */
function ScrollDepthTracker(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const fired = new Set<number>();

    const onScroll = (): void => {
      const { scrollHeight, clientHeight } = document.documentElement;
      const scrollable = scrollHeight - clientHeight;
      // A page shorter than the viewport is 100% seen the moment it renders.
      const percent = scrollable <= 0 ? 100 : (window.scrollY / scrollable) * 100;

      for (const threshold of SCROLL_THRESHOLDS) {
        if (percent >= threshold && !fired.has(threshold)) {
          fired.add(threshold);
          track("scroll_depth_reached", { depth: threshold, path: pathname });
        }
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  return null;
}

/**
 * Outbound link clicks, via one delegated listener rather than per-link props —
 * links written in MDX can't be individually instrumented.
 */
function OutboundLinkTracker(): null {
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (!url.protocol.startsWith("http")) return;
      if (url.host === window.location.host) return;

      track("outbound_link_clicked", {
        href: url.href,
        host: url.host,
        text: anchor.textContent?.trim().slice(0, 200) || null,
      });
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  useEffect(() => {
    initPostHog();
    // Client-side boot report. Shares warnOnce keys with the lazy call sites,
    // so each integration warns exactly once per runtime.
    reportUnconfiguredIntegrations();
  }, []);

  // When PostHog is unconfigured the SDK is never initialised, so the React
  // provider would hand down a dead client. Render children untouched instead.
  if (!integrations.posthog.configured) {
    return <>{children}</>;
  }

  return (
    <PostHogReactProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <ScrollDepthTracker />
      <OutboundLinkTracker />
      {children}
    </PostHogReactProvider>
  );
}

export { getDistinctId, track };
