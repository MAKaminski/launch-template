import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AnalyticsProvider } from "@/components/analytics-provider";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { launchConfig } from "@/launch.config";
import { env, reportUnconfiguredIntegrations, siteUrl } from "@/lib/env";

import "./globals.css";

// Server-side boot report: names every unconfigured integration once, so a
// fresh clone tells you what is missing instead of failing silently later.
reportUnconfiguredIntegrations();

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${launchConfig.name} — ${launchConfig.tagline}`,
    template: `%s — ${launchConfig.name}`,
  },
  description: launchConfig.tagline,
  openGraph: {
    type: "website",
    siteName: launchConfig.name,
    title: launchConfig.name,
    description: launchConfig.tagline,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: launchConfig.name,
    description: launchConfig.tagline,
  },
  // Search Console / Bing Webmaster Tools ownership. Next renders these as
  // <meta name="google-site-verification"> and <meta name="msvalidate.01">.
  // Omitted entirely when unset, rather than emitted empty.
  verification: {
    ...(env.GOOGLE_SITE_VERIFICATION ? { google: env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": env.BING_SITE_VERIFICATION } } : {}),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-scroll-behavior tells Next that the smooth scrolling declared in
    // globals.css is intentional, so it doesn't fight it on route transitions.
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AnalyticsProvider>
          <Nav />
          <main className="mx-auto max-w-3xl px-6">{children}</main>
          <Footer />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
