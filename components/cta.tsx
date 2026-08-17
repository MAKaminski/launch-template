"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { track } from "@/lib/analytics/posthog-client";

export interface CTAProps {
  /** Stable identifier for this CTA across renders — the analytics join key. */
  id: string;
  /** Where on the page this instance lives ("hero", "pricing_footer", ...). */
  location: string;
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}

const STYLES: Record<"primary" | "secondary", string> = {
  primary:
    "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
  secondary:
    "border border-neutral-300 text-neutral-900 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800",
};

export function CTA({ id, location, href, children, variant = "primary" }: CTAProps) {
  return (
    <Link
      href={href}
      onClick={() => track("cta_clicked", { cta_id: id, location })}
      className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${STYLES[variant]}`}
    >
      {children}
    </Link>
  );
}
