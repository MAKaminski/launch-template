# Adding a page

One file. That's the whole thing.

## 1. Create `content/pages/<slug>.mdx`

```mdx
---
title: Changelog
description: What shipped, and when.
nav: true
order: 30
ogImage: null
---

# Changelog

Ordinary markdown. Components are available with no import:

<CTA id="changelog_cta" location="changelog" href="/pricing">See pricing</CTA>
```

## 2. There is no step 2

The file name becomes the route (`/changelog`). You now automatically get:

| | from |
|---|---|
| the route, prerendered at build | `generateStaticParams` in `app/[slug]/page.tsx` |
| a nav link, if `nav: true` | `getNavPages()` |
| `<title>` and OG/meta tags | `generateMetadata` |
| a `sitemap.xml` entry | `app/sitemap.ts` |
| a `page_viewed` event | `<AnalyticsProvider>` |

## Frontmatter

| Field | Type | Meaning |
|---|---|---|
| `title` | string | Page heading and `<title>`. Defaults to the slug. |
| `description` | string | Meta description and OG description. |
| `nav` | boolean | Show in the header nav. |
| `order` | number | Ascending sort in the nav. Defaults to `999`. |
| `ogImage` | string \| null | Absolute or root-relative image URL. |

## Components available in MDX

`<Hero>`, `<CTA>`, `<FAQ>`, `<LeadForm>`, `<BookingButton>` — registered in
`mdx-components.tsx`. Add your own there to make it available everywhere.

## Two things to know

**Reserved slugs.** `index`, `pricing`, `book` and `thanks` have their own route
files. `RESERVED_SLUGS` in `lib/content.ts` keeps `[slug]` from also generating
them, which would be a duplicate-route build error. Name a page one of those and
it won't render — pick a different slug.

**Frontmatter needs `remark-frontmatter`.** It's already configured in
`next.config.ts`. Without it, `@next/mdx` renders the raw `---` block as visible
text at the top of the page. If you ever see that, the plugin got dropped.
