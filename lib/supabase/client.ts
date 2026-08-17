"use client";

import { createBrowserClient } from "@supabase/ssr";

import { dbSchema } from "@/launch.config";
import { env, integrations, warnOnce } from "@/lib/env";

import type { Database } from "./types";

/**
 * Browser Supabase client (anon key, RLS enforced).
 *
 * `db.schema` targets this launch's schema. That schema must ALSO be listed in
 * Supabase → Settings → API → Exposed schemas, or PostgREST returns 404 for
 * every table with a message that doesn't mention the real cause. See
 * docs/SETUP.md step 3.
 */
export function createClient() {
  if (!integrations.supabase.configured) {
    warnOnce(
      "Supabase",
      "set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. Database calls are disabled.",
    );
    return null;
  }

  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    // lib/supabase/types.ts keys this launch's schema shape under `public`,
    // because supabase-js resolves its generics from a literal key. The real
    // schema name is only known at run time, so it is cast here. This narrows
    // nothing: the shapes are identical, and every query stays fully typed.
    { db: { schema: dbSchema as "public" } },
  );
}
