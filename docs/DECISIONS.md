# Decisions

Every choice made that the brief didn't specify, and every place the live docs
contradicted it. Recorded so the next person doesn't have to re-derive them.

---

## Where the live docs contradicted the brief

### 1. The `/ingest` rewrites live in `next.config.ts`, not `vercel.json`

The brief put the PostHog reverse-proxy rewrites in `vercel.json`. They can't go
there: **`vercel.json` rewrites only apply on Vercel.** Locally, `pnpm dev`
would serve nothing at `/ingest`, every analytics request would 404, and the
template would fail its own "works on a fresh clone" requirement — silently,
because PostHog swallows transport errors.

`next.config.ts` rewrites apply in both dev and production. `vercel.json` keeps
the security headers, which genuinely are platform-level.

A side benefit: because the proxy makes ingestion same-origin, the CSP needs
only `connect-src 'self'` for analytics rather than an allowlist.

### 2. `page_viewed` is emitted as `$pageview`

The brief's taxonomy names the event `page_viewed`. Sent literally, that breaks
things: PostHog's web analytics, funnels, path analysis and session replay all
key off the built-in `$pageview`. Emitting both would double every pageview
against the shared quota the brief explicitly wants to pool.

`track("page_viewed", …)` therefore emits `$pageview` with the typed `path` and
`referrer` properties. Full type safety at the call site, native PostHog
features intact, one event on the wire.

### 3. `/thanks` does not fire `purchase_completed`

The brief describes `thanks/page.tsx` as firing `purchase_completed`, while its
taxonomy table marks that event server-side, from the Stripe webhook. Both can't
be right. The webhook is authoritative because:

- a browser event is spoofable — anyone can open `/thanks`;
- it is missed entirely whenever the customer closes the tab before Stripe
  redirects back, which is common;
- firing in both places double-counts revenue.

`/thanks` renders confirmation only.

### 4. `@posthog/next` was available but not used

An official Next.js integration exists (`postHogMiddleware`, `onRequestError`).
It's at **0.8.4** — pre-1.0 — and pulls `@vercel/functions` as a peer dependency.
For a template meant to be stable across many launches over a long period,
wiring `posthog-js` and `posthog-node` directly is the lower-risk call. The
brief's requirements (reverse proxy, super properties, manual pageviews, typed
wrapper) are all straightforward without it. Worth revisiting after 1.0.

---

## Version pins

### ESLint 9.39.5, not 10.8.1

Same shape of problem as TypeScript below. ESLint 10 is npm's `latest`, but the
plugins `eslint-config-next` depends on — `eslint-plugin-import`,
`eslint-plugin-react`, `eslint-plugin-jsx-a11y` — all declare peer ranges topping
out at `^9`. Installing 10 leaves three unmet peers (`pnpm peers check` reports
them) on the exact packages the lint stack is built from. Pinned to the latest
9.x, which resolves cleanly.

`typescript-eslint` is also an explicit devDependency rather than relying on the
transitive copy: in flat config a rule can only be configured in an object that
also registers its plugin, so `eslint.config.mjs` needs to import it directly,
and pnpm's strict `node_modules` won't resolve a package you didn't declare.

### TypeScript 6.0.3, not 7.0.2

`7.0.2` is npm's `latest`, and pinning it **breaks `pnpm lint`**.
`eslint-config-next@16.3.1` depends on `typescript-eslint@^8.46.0`, whose peer
range is `typescript >=4.8.4 <6.1.0`. TypeScript 7 is the native Go port and
sits outside it.

`6.0.3` is the newest stable version inside the supported window. A Dependabot
`ignore` rule for `7.x` is in `.github/dependabot.yml` with the same
explanation; remove it once the lint stack supports 7.

Everything else is pinned to the exact current latest, verified against the npm
registry at build time: Next 16.3.1, React 19.2.8, Tailwind 4.3.3, Zod 4.4.3,
Vitest 4.1.10, Stripe 22.5.0, `@supabase/ssr` 0.12.4 — with ESLint and
TypeScript held back as described above.

### Stripe `apiVersion: "2026-07-29.dahlia"`

Not a guess — it's the version `stripe@22.5.0` is generated against
(`stripe/cjs/apiVersion.js`). Any other string is a type error.

---

## Things that would otherwise cost you an afternoon

### Turbopack cannot take imported MDX plugins

Next 16 defaults to Turbopack, which can't receive plugin *functions* — they
don't serialise across the Rust boundary. `remarkPlugins` must be **strings**:
`remarkPlugins: ["remark-frontmatter"]`. Importing the plugin and passing the
function fails at build.

### `@next/mdx` does not strip frontmatter

Without `remark-frontmatter`, the raw `---` block renders as visible text at the
top of every page. Frontmatter is read separately by `lib/content.ts` via
`gray-matter` for the nav, metadata and sitemap; the plugin's only job is to stop
the MDX renderer printing it.

### Interfaces don't satisfy `Record<string, unknown>`

The row types in `lib/supabase/types.ts` are `type` aliases, not `interface`s,
and that is load-bearing. Supabase's `GenericTable` requires
`Row: Record<string, unknown>`; TypeScript gives **type aliases** an implicit
index signature but **interfaces** none. Declared as interfaces, `LaunchSchema`
silently fails the `GenericSchema` constraint, the client falls back to a generic
schema, and every `.rpc()` and `.from()` call loses its typing with a confusing
"not assignable to parameter of type 'undefined'" error.

### The schema-name cast

Supabase resolves its generics from a *literal* key, but this launch's schema
name (`launch_<slug>`) is only known at runtime. So `lib/supabase/types.ts`
exposes the shape under `public`, and the clients pass
`db: { schema: dbSchema as "public" }`. Structurally identical, fully typed. When
you run `pnpm db:types` the generated file uses the real schema name and those
casts may need adjusting — flagged in `docs/ROADMAP.md`.

### pnpm 11 moved build-script approval

`onlyBuiltDependencies` in `package.json` is ignored by pnpm 11; the setting now
lives in `pnpm-workspace.yaml` as `allowBuilds`. Until every package with an
install script has an explicit `true`/`false` there, `pnpm install` **exits
non-zero** and takes `build`, `test` and CI down with it.

### Next 16's dev server 403s cross-origin `/_next/*`

Playwright's `baseURL` must be `http://localhost:3000`, not `http://127.0.0.1:3000`.
Next treats them as different origins and returns 403 for
`/_next/static/chunks/*` requested from one not in `allowedDevOrigins`. The
symptom is brutal to diagnose: the page renders (it's server-rendered) but no
client component ever hydrates, with no error beyond a failed chunk load.

---

## Additions to the spec

### Two extra events

`scroll_depth_reached` and `outbound_link_clicked`. The brief requires capturing
both behaviours but didn't name events for them — and a raw string would have
violated its own "no raw `posthog.capture()`" rule.

### `leads.ip_hash`

Not in the brief's column list, but its rate-limiting requirement can't be met
without it. Stores `sha256(site_url + ip)` rather than the address: rate limiting
only needs equality, and this keeps raw PII out of the table.

### `webhook_events` is unique on `(provider, external_id)`

The brief says `external_id (unique)`. Composite is the correct key — an event id
is only unique within the provider that issued it, and a Stripe id colliding with
a Cal id would make one silently vanish. Still exactly-once per provider.

### Price IDs come from environment variables

`launch.config.ts` still owns the key → Price ID mapping, and the client still
sends only a plan key — the trust boundary is unchanged. But the ID itself reads
from `NEXT_PUBLIC_PRICE_<PLAN>`, because test-mode and live-mode Price IDs
differ; hardcoding one means editing a committed file every time you switch.

### A test seam in `track()`

Gated behind `NEXT_PUBLIC_ANALYTICS_TEST_HOOK=1`, `track()` mirrors event names
onto `window.__capturedEvents` for the Playwright assertion. Asserting on the
network isn't viable: posthog-js gzips request bodies, and it won't flush a
capture until its remote-config bootstrap resolves — which never happens when
`/ingest` is mocked. `before_send` was tried first and has the same problem.
Because `track()` is the enforced single funnel for all events, mirroring there
observes exactly the taxonomy. Absent from production builds.

### `TODO_` placeholders count as unset

`pnpm init:launch` writes every unfilled secret to `.env.local` as
`TODO_<NAME>`. Those are non-empty strings, so without an explicit check they
read as *configured* — a freshly-initialised launch reported PostHog, Stripe and
Cal as wired up, `/api/health` agreed, and Stripe would have attempted a call
with the literal key `TODO_STRIPE_SECRET_KEY`. `lib/env.ts` now treats a `TODO_`
prefix as absent, and `launch.config.ts` does the same for Price IDs (it can't
import `lib/env`, which imports it). Caught during verification, covered by
tests.

### `launch.config.ts` is generated, not patched

The first implementation rewrote the file with regexes. The `integrations: {`
pattern matches the `LaunchConfig` **interface** before the object literal, so a
non-greedy replace swallowed the entire `export const launchConfig` declaration
and emitted a file that didn't compile — silently, since the script reported
success. It now renders the whole file from a template. An existing `plans:`
array is carried across re-runs by bracket matching rather than a regex, because
plan entries contain nested arrays that a regex cannot balance.

### The log prefix is the launch slug

Every log line reads `[<slug>] …` rather than a fixed string, so when several
launches run side by side — locally, or in aggregated logs — each line says which
one it came from.

### One warning per integration, per process

The `warnOnce` dedupe set lives on `globalThis`, not module scope: Next
evaluates `lib/env` separately in each of its module graphs, and a module-scope
`Set` produced three copies of every warning.

That gets it to exactly one per integration at production runtime, which is what
`pnpm start` shows. **`next build` still prints one set per prerender worker**
(around seven), because Next forks ~12 worker processes and `globalThis` is
per-process. Deduping across OS processes would need IPC or a lockfile, which is
not worth it for a startup warning — so the honest guarantee is *once per
process*, and at runtime there is one process.

### `webhook_events` rows are never released on failure

`markFailed` records the error but keeps the claim. Re-opening it would let the
provider's retry re-run half-finished work. Query
`where error is not null` to find events needing a manual replay.

---

## Deliberately deferred

An RLS table with no policy normally means someone forgot. Here it is intended,
and the migration says so in a comment: anon and authenticated get **no** table
grants at all. Public lead capture goes through a `SECURITY DEFINER` function
with a pinned `search_path` (unpinned, a caller controlling `search_path` could
shadow `leads` and hijack a definer-rights function). Webhooks use the
service-role key, which bypasses RLS by design.
