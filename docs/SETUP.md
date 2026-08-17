# Setup

Standing up a new launch. Target: under 15 minutes once the shared accounts
exist.

---

## Once, ever: the shared accounts

Every launch shares these. Create them once, then reuse.

| Service | What to create | Why shared |
|---|---|---|
| **PostHog** | one project, all launches | cross-launch comparison in one view, one key to rotate, pooled event quota |
| **Supabase** | one project | free/pro tiers cap active projects; a schema per launch gives RLS isolation without paying per launch |
| **Stripe** | one account, test mode | single payout and tax setup; revenue stays sliceable via `metadata.launch_slug` |
| **Cal.com** | one account | one calendar, so parallel ideas can't double-book you |

Mark this repo as a template once:

```bash
gh repo edit --template
```

---

## Per launch

### 1. Create the repo

```bash
gh repo create "Test #1 Repo" --template MAKaminski/launch-template --private --clone
cd "Test #1 Repo"
pnpm install
```

### 2. Initialise

```bash
pnpm init:launch
```

Or non-interactively:

```bash
pnpm init:launch --name "Test #1 Repo" --slug test-1-repo --yes
```

This writes `launch.config.ts`, rewrites `package.json` and the README, generates
`supabase/migrations/0001_init_<slug>.sql`, creates the IndexNow key file, writes
`.env.local` with secrets left as `TODO_`, and prints a numbered checklist.

`--disable` opts out of integrations: `--disable stripe,cal`.

### 3. Verify it boots with nothing configured

```bash
pnpm dev
```

Every page should render, and `curl localhost:3000/api/health | jq` should show
each integration `configured: false`. That's the baseline — fill things in from
here.

---

## Wiring each integration

### PostHog

Project settings → Project API Key.

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or eu.i.posthog.com
NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
POSTHOG_API_KEY=phc_...
```

Then in PostHog, create the launch's dashboard as a filter on
`launch_slug = <your-slug>`, and add `app_env != preview` so preview deploys stay
out of your numbers.

Events are reverse-proxied through `/ingest` (see `next.config.ts`), so ad
blockers don't eat 20–40% of traffic. Nothing to configure — it just works in dev
and production.

### Supabase

```bash
pnpm db:push
```

Then — **this is the step everyone misses**:

> Dashboard → Settings → API → **Exposed schemas** → add `launch_<slug>`

Without it, PostgREST returns 404 for every table and the error message doesn't
say why. If queries 404 immediately after a clean migration, this is it.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # server only — never NEXT_PUBLIC_
SUPABASE_PROJECT_ID=xxxx
```

Then regenerate types from the live schema:

```bash
pnpm db:types
```

### Stripe

Create a Product and Price, tagged so revenue stays sliceable:

```bash
stripe products create --name "Starter" --metadata launch_slug=<your-slug>
stripe prices create --product prod_xxx --unit-amount 4900 --currency usd \
  --metadata launch_slug=<your-slug>
```

Put the Price IDs in `.env.local` (they differ between test and live mode, which
is why they aren't committed):

```bash
NEXT_PUBLIC_PRICE_STARTER=price_...
NEXT_PUBLIC_PRICE_PRO=price_...
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Locally, run the webhook forwarder and paste the `whsec_` it prints:

```bash
pnpm stripe:listen
```

In production, register `https://<domain>/api/webhooks/stripe` for
`checkout.session.completed`, `payment_intent.succeeded`, and
`customer.subscription.*`.

The app refuses to start with an `sk_live_` key unless `NODE_ENV=production`.

### Cal.com

Create one event type for this launch. For `cal.com/acme/intro-call`:

```bash
NEXT_PUBLIC_CAL_USERNAME=acme
NEXT_PUBLIC_CAL_EVENT_SLUG=intro-call
CAL_WEBHOOK_SECRET=<the secret you set on the webhook>
```

Add a webhook to `https://<domain>/api/webhooks/cal` for `BOOKING_CREATED`,
`BOOKING_RESCHEDULED` and `BOOKING_CANCELLED`, with a `secret` — the route
verifies it as HMAC-SHA256 over the raw body and rejects anything unsigned.

---

## Search engines

### Bing, Yandex, Seznam, Naver — automated

`pnpm init:launch` generated `public/<key>.txt` and set `INDEXNOW_KEY`. Once
deployed:

```bash
pnpm seo:submit            # --dry-run to preview
```

This reads `/sitemap.xml` and bulk-posts every URL to IndexNow (up to 10,000 per
request). A `403` means the key file isn't reachable at
`https://<domain>/<key>.txt`; a `422` means the URLs don't match the declared host.

### Google — verification, then crawling

**Google has no auto-submit for ordinary pages.** The anonymous
`google.com/ping?sitemap=` endpoint was removed, and the Indexing API only
accepts `JobPosting` and `BroadcastEvent` structured data. Anything claiming
otherwise is describing a dead endpoint.

What actually works:

1. `app/robots.ts` advertises the sitemap — automatic, already done.
2. `app/sitemap.ts` lists every route — automatic, already done.
3. Verify ownership in Search Console once, and set:

```bash
GOOGLE_SITE_VERIFICATION=<content value of the HTML tag>
BING_SITE_VERIFICATION=<msvalidate.01 content value>
```

Both render as meta tags from `app/layout.tsx`. Then submit the sitemap in the
Search Console UI once. After that, Google re-crawls on its own.

If you later want Google fully automated, it means the Search Console API and a
Google Cloud service account — a new secret per launch. Noted in
[ROADMAP.md](./ROADMAP.md).

---

## Deploy

```bash
vercel link --project <your-slug>
vercel domains add <your-domain>
```

Env vars, per environment (`production`, `preview`, `development`):

```bash
vercel env add NEXT_PUBLIC_POSTHOG_KEY production
vercel env add NEXT_PUBLIC_POSTHOG_HOST production
vercel env add NEXT_PUBLIC_POSTHOG_UI_HOST production
vercel env add POSTHOG_API_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add STRIPE_SECRET_KEY production
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add NEXT_PUBLIC_PRICE_STARTER production
vercel env add NEXT_PUBLIC_PRICE_PRO production
vercel env add NEXT_PUBLIC_CAL_USERNAME production
vercel env add NEXT_PUBLIC_CAL_EVENT_SLUG production
vercel env add CAL_WEBHOOK_SECRET production
vercel env add NEXT_PUBLIC_SITE_URL production
vercel env add GOOGLE_SITE_VERIFICATION production
vercel env add BING_SITE_VERIFICATION production
vercel env add INDEXNOW_KEY production
```

Set `NEXT_PUBLIC_SITE_URL` per environment — preview deploys need their own
origin for correct canonical URLs and Stripe redirects.

`app_env` is derived from `VERCEL_ENV` automatically, so preview traffic is
already filterable in PostHog with no extra config.

Repo secrets for CI, if you add jobs that need them:

```bash
gh secret set STRIPE_SECRET_KEY --body "sk_test_..."
```

CI as shipped needs **no** secrets — that's deliberate, and it's what keeps the
zero-credential promise honest.

```bash
vercel --prod
```

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Every Supabase query 404s | Schema not added to **Exposed schemas** |
| Analytics silent in prod | Check `/ingest/*` isn't blocked; confirm `NEXT_PUBLIC_POSTHOG_KEY` is set for that environment |
| Funnel breaks at payment | `posthog_distinct_id` missing from Stripe metadata — see [EVENTS.md](./EVENTS.md) |
| Webhook 400s | Body parsed before signature check, or wrong `whsec_` for this environment |
| Duplicate orders | The `webhook_events` claim isn't running before business logic |
| `pnpm lint` fails after a TS bump | TypeScript 7 isn't supported by the lint stack — see [DECISIONS.md](./DECISIONS.md) |
| Pricing buttons disabled | No Price ID for that plan — set `NEXT_PUBLIC_PRICE_<PLAN>` |
| Raw `---` at top of a page | `remark-frontmatter` dropped from `next.config.ts` |
