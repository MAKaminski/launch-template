import createMDX from "@next/mdx";
import type { NextConfig } from "next";

/**
 * PostHog reverse proxy.
 *
 * These rewrites live here rather than in `vercel.json` on purpose: `vercel.json`
 * rewrites only apply on Vercel, so `pnpm dev` would silently 404 every analytics
 * request and the template would fail its own "works on a fresh clone" test.
 * `next.config.ts` rewrites apply in both local dev and production.
 */
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_ASSET_HOST = POSTHOG_HOST.includes("eu.i.posthog.com")
  ? "https://eu-assets.i.posthog.com"
  : "https://us-assets.i.posthog.com";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],

  // PostHog's proxy relies on exact paths; a trailing-slash redirect breaks ingestion.
  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [
      // Static assets (array-js, recorder, surveys) come from the asset host.
      {
        source: "/ingest/static/:path*",
        destination: `${POSTHOG_ASSET_HOST}/static/:path*`,
      },
      // Everything else (capture, flags, batch) goes to the ingestion host.
      {
        source: "/ingest/:path*",
        destination: `${POSTHOG_HOST}/:path*`,
      },
    ];
  },
};

const withMDX = createMDX({
  options: {
    // Turbopack (the Next 16 default) cannot receive imported plugin functions —
    // they are not serializable across the Rust boundary. Plugins must be named
    // as strings with serializable options.
    remarkPlugins: ["remark-frontmatter"],
  },
});

export default withMDX(nextConfig);
