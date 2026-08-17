import type { Metadata } from "next";

import { getPage } from "@/lib/content";

import Content from "@/content/pages/index.mdx";

export function generateMetadata(): Metadata {
  const page = getPage("index");
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    ...(page.ogImage ? { openGraph: { images: [page.ogImage] } } : {}),
  };
}

export default function HomePage() {
  return <Content />;
}
