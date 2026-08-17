# Roadmap

Deliberately **not** in v1. Each is a real seam in the code rather than a
missing feature — the extension point exists, the implementation doesn't.

| Candidate | Where it would attach |
|---|---|
| **Auth / login** | `@supabase/ssr` is already wired with cookie-based sessions and the middleware pattern is documented in the Supabase docs. `lib/supabase/server.ts` has the `setAll` try/catch that a session refresh needs. RLS policies would move from deny-all to `auth.uid()`-scoped. |
| **Email sending** | The `leads` table captures addresses but nothing sends. A provider call belongs in `app/actions.ts` after the `capture_lead` RPC, and in the Stripe webhook after the `orders` upsert. |
| **CMS** | `lib/content.ts` is the seam: it returns `ContentPage[]` from the filesystem. Swapping it for an API call leaves `app/[slug]/page.tsx`, the nav and the sitemap untouched. |
| **Blog** | A second content collection alongside `content/pages/`, with its own route group and an RSS feed. |
| **i18n** | Next's `[locale]` segment plus a locale key on the content index. The event taxonomy would gain a `locale` super property. |
| **A/B testing** | The PostHog provider is wired and feature flags work today; v1 just ships zero flags. `posthog.getFeatureFlag()` in a client component is the whole integration. There's a commented example in `lib/analytics/posthog-client.ts`. |
| **Admin dashboard** | Requires auth first. The service-role client in `lib/supabase/admin.ts` already has the access; it needs a UI and a guard. |
| **Subscription customer portal** | `stripe.billingPortal.sessions.create()` in a new route handler. The `customers` table already stores `stripe_customer_id`, which is the only input it needs. |

## Known limitations in v1

- **Google cannot be auto-submitted.** Anonymous sitemap pinging was retired and
  the Indexing API only accepts `JobPosting`/`BroadcastEvent`. Adding real
  automation means the Search Console API and a Google Cloud service account —
  a new secret to manage per launch. Bing and friends are already automated via
  IndexNow. See [SETUP.md](./SETUP.md).
- **`pnpm db:types` overwrites the `public` key convention.** The placeholder in
  `lib/supabase/types.ts` keys this launch's schema under `public` so supabase-js
  can resolve its generics. Generated types use the real schema name; you may
  need to adjust the `as "public"` casts in `lib/supabase/*.ts`. Explained in
  [DECISIONS.md](./DECISIONS.md).
- **One event type per launch in Cal.com.** Multiple event types per launch would
  need `NEXT_PUBLIC_CAL_EVENT_SLUG` to become a list and `<BookingEmbed>` to take
  a selector.
