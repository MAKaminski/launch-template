import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { dbSchema } from "@/launch.config";
import { env, integrations, warnOnce } from "@/lib/env";

import type { Database } from "./types";

/**
 * Server-side Supabase client for Server Components and Route Handlers
 * (anon key, RLS enforced, session read from cookies).
 *
 * Uses `@supabase/ssr` with the getAll/setAll cookie interface — the older
 * get/set/remove trio and the `auth-helpers` packages are deprecated and cause
 * session desync.
 */
export async function createClient() {
  if (!integrations.supabase.configured) {
    warnOnce(
      "Supabase",
      "set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. Database calls are disabled.",
    );
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      // See lib/supabase/client.ts for why this is cast.
      db: { schema: dbSchema as "public" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Safe to ignore — v1 ships
            // no auth, so there is no session to refresh.
          }
        },
      },
    },
  );
}
