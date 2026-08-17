import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { dbSchema } from "@/launch.config";
import { env, integrations, warnOnce } from "@/lib/env";

import type { Database } from "./types";

/**
 * Service-role Supabase client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * The `import "server-only"` above is load-bearing: it makes the build fail
 * loudly if this module is ever pulled into a client component, rather than
 * quietly shipping a god-mode database key to every visitor's browser.
 *
 * Only webhook handlers should use this — they have no user session but must
 * write to tables that are service-role-only by policy.
 */
export function createAdminClient() {
  if (!integrations.supabase.adminConfigured) {
    warnOnce(
      "Supabase",
      "set SUPABASE_SERVICE_ROLE_KEY in .env.local. Webhooks will verify signatures but not persist.",
    );
    return null;
  }

  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      // See lib/supabase/client.ts for why this is cast.
      db: { schema: dbSchema as "public" },
      auth: {
        // No session to persist or refresh: this is a machine-to-machine client.
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
