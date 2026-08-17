import type { Metadata } from "next";
import Link from "next/link";

import { launchConfig } from "@/launch.config";

export const metadata: Metadata = {
  title: "Thank you",
  description: `Your ${launchConfig.name} order is confirmed.`,
  // Never index a post-conversion page: it has no search value and leaks
  // session ids into the index if a query string is ever crawled.
  robots: { index: false, follow: false },
};

interface ThanksPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

/**
 * Post-checkout confirmation.
 *
 * Deliberately does NOT fire `purchase_completed`. That event is emitted
 * server-side by the Stripe webhook, which is authoritative for two reasons:
 * a browser event can be spoofed by anyone who opens /thanks directly, and it
 * is simply missed whenever the customer closes the tab before Stripe redirects
 * them back. Firing in both places would also double-count revenue. See
 * docs/DECISIONS.md.
 */
export default async function ThanksPage({ searchParams }: ThanksPageProps) {
  const { session_id: sessionId } = await searchParams;

  return (
    <div className="py-20">
      <h1 className="text-4xl font-bold tracking-tight">Thank you</h1>
      <p className="mt-4 max-w-2xl text-lg text-neutral-600 dark:text-neutral-400">
        Your order is confirmed and a receipt is on its way to your inbox.
      </p>

      {sessionId ? (
        <p className="mt-6 font-mono text-xs text-neutral-400">Reference: {sessionId}</p>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Back to home
        </Link>
        <Link
          href="/book"
          className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Book onboarding
        </Link>
      </div>
    </div>
  );
}
