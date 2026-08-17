"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { logPrefix } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface LeadResult {
  ok: boolean;
  error?: string;
}

/**
 * Hashes the caller's IP for rate limiting.
 *
 * We store a hash rather than the address itself: rate limiting only needs
 * equality, never the original value, and a hash keeps the leads table free of
 * raw personal data. Salted with the site URL so the same visitor across two
 * launches doesn't produce a correlatable identifier.
 */
function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

export async function submitLead(formData: FormData): Promise<LeadResult> {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "").trim() || "website";
  const distinctId = String(formData.get("posthog_distinct_id") ?? "").trim() || null;

  if (!isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  if (!supabase) {
    // Unconfigured Supabase must not look like a broken form. The warning has
    // already been logged once by lib/env; the visitor sees a clean success.
    return { ok: true };
  }

  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";

  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim()) utm[key] = value.trim();
  }

  // Goes through the SECURITY DEFINER function rather than a direct INSERT:
  // anon has no table-level grant on `leads` at all, so this function is the
  // only path in, and it enforces the per-IP rate limit server-side.
  const { error } = await supabase.rpc("capture_lead", {
    p_email: email,
    p_name: name,
    p_source: source,
    p_utm: Object.keys(utm).length > 0 ? utm : null,
    p_posthog_distinct_id: distinctId,
    p_ip_hash: hashIp(ip, process.env.NEXT_PUBLIC_SITE_URL ?? "launch"),
  });

  if (error) {
    if (error.message.includes("rate_limit")) {
      return { ok: false, error: "Too many submissions. Try again in a few minutes." };
    }
    console.error(`${logPrefix} lead capture failed`, error.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true };
}
