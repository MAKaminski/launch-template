## What and why

<!-- One or two sentences. What changes, and what problem it solves. -->

## Checks

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass
- [ ] Still boots with **no** `.env.local` (every integration degrades to a no-op)

## If this touches…

<!-- Delete the sections that don't apply. -->

**Analytics** — new events are declared in `lib/analytics/events.ts` and the
table in `docs/EVENTS.md` is updated to match. No raw `posthog.capture()` calls.

**Payments** — the client still sends only a plan *key*; no price or amount is
trusted from the request body. Webhook changes preserve the `webhook_events`
idempotency gate *before* any business logic.

**Database** — a new migration is added rather than an existing one edited. RLS
is enabled on any new table, with either an explicit policy or a comment saying
why it is deliberately service-role-only.

**Content** — new pages are a single `.mdx` file in `content/pages/` with
complete frontmatter (`title`, `description`, `nav`, `order`, `ogImage`).
