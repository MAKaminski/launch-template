import type { MetadataRoute } from "next";

import { allRoutes } from "@/lib/content";
import { siteUrl } from "@/lib/env";

/**
 * Generated from the content directory, so a new MDX file appears in the
 * sitemap with no extra wiring. This is also what `pnpm seo:submit` reads when
 * pushing URLs to IndexNow.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return allRoutes().map((route) => ({
    url: new URL(route, siteUrl).toString(),
    lastModified: now,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
