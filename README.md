# Launch Template

Stand up a new product-idea launch — multi-page marketing site, analytics,
database, payments and booking — in under fifteen minutes, repeatedly, for many
ideas running in parallel.

```bash
gh repo create "My New Idea" --template MAKaminski/launch-template --private --clone
cd "My New Idea"
pnpm install
pnpm init:launch
```

## The idea

One Vercel project per launch, so each gets its own domain and deploy cadence.
Everything behind that is **shared**, joined by a single `launch_slug`:

| Layer | Shared | Joined by |
|---|---|---|
| Hosting | no — one project per launch | — |
| Analytics | one PostHog project | `launch_slug` super property |
| Database | one Supabase project | `launch_<slug>` Postgres schema |
| Payments | one Stripe account | `metadata.launch_slug` |
| Scheduling | one Cal.com account | one event type per launch |

Running ten ideas costs roughly what running one does, and every launch stays
comparable in a single view.

## It runs with zero credentials

```bash
pnpm install && pnpm dev
```

No `.env.local`, no accounts, no setup. Every page renders; each unconfigured
integration degrades to a no-op and logs exactly one warning. `/api/health`
reports what's wired:

```bash
curl localhost:3000/api/health | jq
```

Fill integrations in one at a time, in any order. Nothing is a prerequisite for
anything else.

## Adding a page

One file. Drop `content/pages/changelog.mdx` with frontmatter and you get the
route, a nav entry, meta tags, a sitemap entry and pageview tracking — no other
edits. See [docs/ADDING-A-PAGE.md](docs/ADDING-A-PAGE.md).

## What's actually wired

- **Analytics that survives ad blockers.** PostHog reverse-proxied through
  `/ingest`, with a closed, typed event taxonomy. Raw `posthog.capture()` calls
  fail lint.
- **A funnel that doesn't break at checkout.** The browser's `distinct_id` is
  threaded through Stripe and Cal metadata, so server-side `purchase_completed`
  lands on the same person who started checkout. This is the part most templates
  get wrong — [docs/EVENTS.md](docs/EVENTS.md) has the diagram.
- **Webhooks that can't double-charge.** Both providers share one idempotency
  ledger; the claim is an atomic unique insert that runs before any business
  logic.
- **A database that's locked down from migration one.** RLS on every table,
  deny-by-default. Public lead capture goes through a rate-limited
  `SECURITY DEFINER` function, not a table grant.
- **Prices the client can't tamper with.** The browser sends a plan *key*; the
  server resolves the Price ID.

## Commands

| | |
|---|---|
| `pnpm dev` | dev server |
| `pnpm build` | production build |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | the gates CI runs |
| `pnpm test:e2e` | Playwright smoke test |
| `pnpm init:launch` | turn the template into a launch |
| `pnpm db:push` · `pnpm db:types` · `pnpm db:reset` | Supabase |
| `pnpm stripe:listen` | forward Stripe webhooks locally |
| `pnpm seo:submit` | push sitemap URLs to IndexNow |

## Docs

- [SETUP.md](docs/SETUP.md) — accounts, keys, deploy, troubleshooting
- [EVENTS.md](docs/EVENTS.md) — the taxonomy and the distinct_id flow
- [ADDING-A-PAGE.md](docs/ADDING-A-PAGE.md) — under 20 lines
- [DECISIONS.md](docs/DECISIONS.md) — every non-obvious choice, and why
- [ROADMAP.md](docs/ROADMAP.md) — what v1 deliberately leaves out

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 6 (strict) ·
Tailwind 4 · PostHog · Supabase · Stripe · Cal.com · Vitest · Playwright

Versions are pinned exactly; Dependabot moves them deliberately with CI proving
each bump.

## Notes

Search engines: Bing, Yandex, Seznam and Naver are submitted automatically via
IndexNow. **Google is not** — it retired anonymous sitemap pinging and its
Indexing API only accepts job postings and broadcast events. Google gets
`robots.txt`, a sitemap and a verification meta tag, then crawls on its own.
