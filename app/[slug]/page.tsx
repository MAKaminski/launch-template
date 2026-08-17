import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { contentSlugs, getPage } from "@/lib/content";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Every MDX file in content/pages/ that doesn't have its own route file becomes
 * a page here. Slugs come from lib/content.ts, which reads frontmatter off disk
 * at build time; the body is loaded by dynamic import below.
 *
 * `dynamicParams = false` makes anything not in this list a 404 rather than an
 * attempted runtime import of a file that doesn't exist.
 */
export function generateStaticParams(): Array<{ slug: string }> {
  return contentSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);
  if (!page) return {};

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.href },
    ...(page.ogImage ? { openGraph: { images: [page.ogImage] } } : {}),
  };
}

export default async function ContentPage({ params }: PageProps) {
  const { slug } = await params;

  if (!contentSlugs().includes(slug)) notFound();

  const { default: Content } = await import(`@/content/pages/${slug}.mdx`);
  return <Content />;
}
