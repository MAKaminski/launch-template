# Events

All analytics flows through one shared PostHog project. Every launch is a filter
on `launch_slug`, not a separate project.

## Super properties

Registered once at init and attached to **every** event, client and server:

| Property | Value |
|---|---|
| `launch_slug` | `launchConfig.slug` |
| `launch_name` | `launchConfig.name` |
| `app_env` | `production` \| `preview` \| `development` (from `VERCEL_ENV`) |

Filter dashboards on `launch_slug`, and exclude `app_env = preview` so preview
deploys don't pollute the numbers.

## The taxonomy

Declared in [`lib/analytics/events.ts`](../lib/analytics/events.ts) as a closed
union. Adding an event means adding it there — an ESLint `no-restricted-syntax`
rule fails the build on any raw `posthog.capture()` call outside `lib/analytics/`.

| Event | Fired | Where | Key properties |
|---|---|---|---|
| `page_viewed` | every route change | client | `path`, `referrer` |
| `cta_clicked` | any CTA | client | `cta_id`, `location` |
| `lead_submitted` | lead form success | client | `email_domain`, `source` |
| `pricing_viewed` | pricing page mount | client | `plan_ids` |
| `checkout_started` | checkout button | client | `price_id`, `amount_cents`, `plan_key` |
| `purchase_completed` | Stripe webhook | **server** | `amount_cents`, `currency`, `stripe_customer_id`, `stripe_session_id` |
| `booking_started` | Cal embed opened | client | `event_type` |
| `booking_completed` | Cal webhook | **server** | `event_type`, `start_time`, `cal_booking_uid` |
| `scroll_depth_reached` | 25/50/75/100% | client | `depth`, `path` |
| `outbound_link_clicked` | external link | client | `href`, `host`, `text` |

Two notes on the table:

- **`page_viewed` is sent as `$pageview`.** PostHog's web analytics, funnels and
  path analysis all key off `$pageview`. A separate event would either break
  those or double-count against the shared quota, so `track("page_viewed", …)`
  emits `$pageview` with typed properties. You get type safety *and* the native
  features.
- **`scroll_depth_reached` and `outbound_link_clicked`** aren't in the original
  spec's table, but capturing both behaviours was required — and a raw string
  would have violated the taxonomy rule. So they're declared like everything else.

## The distinct_id problem

This is the part most templates get wrong, and the symptom is subtle: your
funnel shows people starting checkout and nobody finishing, even though revenue
is arriving.

The cause is that `checkout_started` fires in the browser as person A, and
`purchase_completed` fires from the Stripe webhook — a completely separate
process with no cookies — as a newly-invented person B. PostHog has no way to
know they're the same human.

The fix is to carry the browser's id across the payment boundary:

```
Browser                     Your server              Stripe            Webhook
───────                     ───────────              ──────            ───────
posthog cookie
ph_<key>_posthog
  { distinct_id: "abc" }
        │
        │  POST /api/checkout { planKey, distinctId: "abc" }
        ▼
                    reads body, falls back to
                    the cookie header
                            │
                            │  metadata.posthog_distinct_id = "abc"
                            │  …on the Session AND the PaymentIntent
                            ▼
                                              stores it
                                                  │
                                                  │  checkout.session.completed
                                                  ▼
                                                          metadata.posthog_distinct_id
                                                                    │
                                        trackServer("purchase_completed", "abc", …)
```

Both events now belong to `abc`, and the funnel closes.

Implementation notes:

- The cookie is `ph_<projectApiKey>_posthog`, URL-encoded JSON containing
  `distinct_id`. Parsed by [`lib/analytics/distinct-id.ts`](../lib/analytics/distinct-id.ts).
- The id is written to metadata on **both** the Session and the downstream
  intent. Stripe rejects `payment_intent_data` in subscription mode, so the key
  differs by mode (`subscription_data` there).
- Cal.com carries it the same way, through the embed's `metadata` config.
- When there's no cookie (blocked script, first touch), the server falls back to
  `anon_<id>`. Those are deliberately prefixed so you can spot and exclude them.

## Server-side events

`trackServer()` uses posthog-node's `captureImmediate()`, which awaits the HTTP
round-trip. Buffered `capture()` would be silently dropped — a serverless
invocation can be frozen the instant it returns a response.

## Adding an event

1. Add the name and payload to `EventPayloads` in `lib/analytics/events.ts`.
2. Add it to the `EVENT_NAMES` set just below.
3. Add a row to the table above.
4. Call `track()` (client) or `trackServer()` (server). Nothing else.

`tests/unit/events.test.ts` asserts the shipped taxonomy exactly, so step 2 will
fail loudly if you skip it.
