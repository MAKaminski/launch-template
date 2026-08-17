import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/env";

/**
 * The `Sitemap:` directive here is the primary way Google discovers the
 * sitemap: the old anonymous `google.com/ping?sitemap=` endpoint was retired,
 * and Google's Indexing API only accepts JobPosting and BroadcastEvent content,
 * not general pages. So for Google this file plus a one-time Search Console
 * verification is the whole story. Bing is submitted actively via IndexNow —
 * see scripts/seo-submit.ts and docs/SETUP.md.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // No SEO value, and /thanks can carry a Stripe session id.
        disallow: ["/api/", "/thanks", "/ingest/"],
      },
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl,
  };
}
