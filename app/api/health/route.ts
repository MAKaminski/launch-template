import { NextResponse } from "next/server";

import { launchConfig } from "@/launch.config";
import { appEnv, integrations } from "@/lib/env";
import { isLiveMode } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reports which integrations are actually wired up.
 *
 * On a fresh clone with no .env.local every entry reads `configured: false` and
 * the app still serves every page — that combination is the template's core
 * promise, and this endpoint is how you verify it.
 */
export function GET() {
  const body = {
    ok: true,
    launch: {
      slug: launchConfig.slug,
      name: launchConfig.name,
      app_env: appEnv,
    },
    integrations: {
      posthog: {
        configured: integrations.posthog.configured,
        server: integrations.posthog.serverConfigured,
        proxy: "/ingest",
      },
      supabase: {
        configured: integrations.supabase.configured,
        admin: integrations.supabase.adminConfigured,
        schema: `launch_${launchConfig.slug.replace(/-/g, "_")}`,
      },
      stripe: {
        configured: integrations.stripe.configured,
        client: integrations.stripe.clientConfigured,
        webhook: integrations.stripe.webhookConfigured,
        mode: isLiveMode() ? "live" : "test",
        plans_with_price_id: launchConfig.plans.filter((plan) => plan.priceId !== null).length,
        plans_total: launchConfig.plans.length,
      },
      cal: {
        configured: integrations.cal.configured,
        webhook: integrations.cal.webhookConfigured,
      },
      indexnow: {
        configured: integrations.indexnow.configured,
      },
    },
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
