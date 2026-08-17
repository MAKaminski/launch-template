import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { BookingButton } from "@/components/booking-button";
import { CTA } from "@/components/cta";
import { FAQ } from "@/components/faq";
import { Hero } from "@/components/hero";
import { LeadForm } from "@/components/lead-form";

/**
 * Required by @next/mdx in the App Router. Anything returned here is available
 * inside every `content/pages/*.mdx` file with no import — which is what keeps
 * "add a page" down to a single file.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props: ComponentPropsWithoutRef<"h1">) => (
      <h1 className="mt-10 mb-4 text-4xl font-bold tracking-tight text-balance" {...props} />
    ),
    h2: (props: ComponentPropsWithoutRef<"h2">) => (
      <h2 className="mt-10 mb-3 text-2xl font-semibold tracking-tight" {...props} />
    ),
    h3: (props: ComponentPropsWithoutRef<"h3">) => (
      <h3 className="mt-8 mb-2 text-xl font-semibold" {...props} />
    ),
    p: (props: ComponentPropsWithoutRef<"p">) => (
      <p className="my-4 leading-7 text-neutral-700 dark:text-neutral-300" {...props} />
    ),
    ul: (props: ComponentPropsWithoutRef<"ul">) => (
      <ul className="my-4 list-disc space-y-2 pl-6 text-neutral-700 dark:text-neutral-300" {...props} />
    ),
    ol: (props: ComponentPropsWithoutRef<"ol">) => (
      <ol className="my-4 list-decimal space-y-2 pl-6 text-neutral-700 dark:text-neutral-300" {...props} />
    ),
    a: ({ href, ...props }: ComponentPropsWithoutRef<"a">) => {
      const isInternal = href?.startsWith("/") ?? false;
      return isInternal ? (
        <Link href={href ?? "/"} className="font-medium underline underline-offset-4" {...props} />
      ) : (
        <a
          href={href}
          className="font-medium underline underline-offset-4"
          rel="noopener noreferrer"
          target="_blank"
          {...props}
        />
      );
    },
    code: (props: ComponentPropsWithoutRef<"code">) => (
      <code
        className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-sm dark:bg-neutral-800"
        {...props}
      />
    ),
    hr: () => <hr className="my-10 border-neutral-200 dark:border-neutral-800" />,

    // Interactive components, usable directly from any MDX page.
    Hero,
    CTA,
    FAQ,
    LeadForm,
    BookingButton,

    ...components,
  };
}
