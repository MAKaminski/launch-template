import type { ReactNode } from "react";

import { CTA } from "./cta";

export interface HeroProps {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  children?: ReactNode;
}

export function Hero({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  children,
}: HeroProps) {
  return (
    <section className="py-16 sm:py-24">
      <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
      {subtitle ? (
        <p className="mt-5 max-w-2xl text-lg text-pretty text-neutral-600 dark:text-neutral-400">
          {subtitle}
        </p>
      ) : null}

      {children}

      {(ctaLabel && ctaHref) || (secondaryLabel && secondaryHref) ? (
        <div className="mt-8 flex flex-wrap gap-3">
          {ctaLabel && ctaHref ? (
            <CTA id="hero_primary" location="hero" href={ctaHref}>
              {ctaLabel}
            </CTA>
          ) : null}
          {secondaryLabel && secondaryHref ? (
            <CTA id="hero_secondary" location="hero" href={secondaryHref} variant="secondary">
              {secondaryLabel}
            </CTA>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
