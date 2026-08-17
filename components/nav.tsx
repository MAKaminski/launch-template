import Link from "next/link";

import { launchConfig } from "@/launch.config";
import { getNavPages } from "@/lib/content";

/**
 * Nav is generated from MDX frontmatter (`nav: true`, sorted by `order`) plus
 * the two hard-coded real routes. Adding a page to the nav means setting one
 * frontmatter field — no edit here.
 */
export function Nav() {
  const pages = getNavPages();

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto flex max-w-3xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          {launchConfig.name}
        </Link>
        <ul className="flex items-center gap-5 text-sm">
          {pages.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                {page.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
