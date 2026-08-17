import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

/**
 * Build-time content index for `content/pages/*.mdx`.
 *
 * Two cooperating halves make "add a page = add one file" work:
 *
 *  1. This module reads frontmatter off disk with gray-matter. It feeds
 *     generateStaticParams, generateMetadata, the nav, and sitemap.ts.
 *  2. `app/[slug]/page.tsx` renders the body via dynamic `import()` of the MDX.
 *
 * They must agree on the slug set, hence `contentSlugs()` below.
 *
 * Node APIs here mean this file is server-only by construction — never import
 * it from a "use client" component.
 */

export const CONTENT_DIR = path.join(process.cwd(), "content", "pages");

/**
 * Slugs that have a real route file of their own and must NOT also be generated
 * by `app/[slug]/page.tsx`, or Next.js reports a duplicate-route conflict.
 */
export const RESERVED_SLUGS = new Set(["index", "pricing", "book", "thanks"]);

export interface PageFrontmatter {
  title: string;
  description: string;
  /** Show in the header nav. */
  nav: boolean;
  /** Ascending sort within the nav. */
  order: number;
  ogImage: string | null;
}

export interface ContentPage extends PageFrontmatter {
  slug: string;
  /** Route path — "index" maps to "/". */
  href: string;
}

function coerceFrontmatter(data: Record<string, unknown>, slug: string): PageFrontmatter {
  const title = typeof data.title === "string" ? data.title : slug;
  const description = typeof data.description === "string" ? data.description : "";
  const nav = typeof data.nav === "boolean" ? data.nav : false;
  const order = typeof data.order === "number" ? data.order : 999;
  const ogImage = typeof data.ogImage === "string" ? data.ogImage : null;
  return { title, description, nav, order, ogImage };
}

function readAll(): ContentPage[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
      const { data } = matter(raw);
      return {
        slug,
        href: slug === "index" ? "/" : `/${slug}`,
        ...coerceFrontmatter(data as Record<string, unknown>, slug),
      };
    })
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

/**
 * Cached because Next calls generateStaticParams, generateMetadata and the nav
 * render separately during a single build — no reason to re-stat the directory
 * for each. Safe: the content directory cannot change mid-build.
 */
let cache: ContentPage[] | null = null;

export function getAllPages(): ContentPage[] {
  cache ??= readAll();
  return cache;
}

/** Pages rendered by the `[slug]` dynamic route (everything with no own route file). */
export function getDynamicPages(): ContentPage[] {
  return getAllPages().filter((page) => !RESERVED_SLUGS.has(page.slug));
}

export function contentSlugs(): string[] {
  return getDynamicPages().map((page) => page.slug);
}

export function getPage(slug: string): ContentPage | undefined {
  return getAllPages().find((page) => page.slug === slug);
}

/** Nav entries, including the hard-coded real routes. */
export function getNavPages(): ContentPage[] {
  const fromContent = getAllPages().filter((page) => page.nav);

  const realRoutes: ContentPage[] = [
    {
      slug: "pricing",
      href: "/pricing",
      title: "Pricing",
      description: "Plans and pricing.",
      nav: true,
      order: 50,
      ogImage: null,
    },
    {
      slug: "book",
      href: "/book",
      title: "Book a call",
      description: "Find a time that works.",
      nav: true,
      order: 60,
      ogImage: null,
    },
  ];

  const seen = new Set(fromContent.map((page) => page.slug));
  return [...fromContent, ...realRoutes.filter((route) => !seen.has(route.slug))].sort(
    (a, b) => a.order - b.order,
  );
}

/** Every routable path, for sitemap.ts. */
export function allRoutes(): string[] {
  const dynamic = getDynamicPages().map((page) => page.href);
  return ["/", ...dynamic, "/pricing", "/book"];
}
