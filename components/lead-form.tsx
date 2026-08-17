"use client";

import { useState, useTransition } from "react";

import { submitLead } from "@/app/actions";
import { getDistinctId, track } from "@/lib/analytics/posthog-client";
import { emailDomain } from "@/lib/analytics/events";

export interface LeadFormProps {
  source?: string;
  label?: string;
  buttonLabel?: string;
  successMessage?: string;
}

export function LeadForm({
  source = "website",
  label = "Get early access",
  buttonLabel = "Join the list",
  successMessage = "You're on the list. We'll be in touch.",
}: LeadFormProps) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "");

    formData.set("source", source);
    // Threaded so the lead row can be joined back to its PostHog person.
    formData.set("posthog_distinct_id", getDistinctId() ?? "");

    // Carry UTMs from the landing URL through to attribution.
    const params = new URLSearchParams(window.location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const value = params.get(key);
      if (value) formData.set(key, value);
    }

    startTransition(async () => {
      const result = await submitLead(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      // Only the domain reaches analytics — never the full address.
      track("lead_submitted", { email_domain: emailDomain(email), source });
      setDone(true);
      form.reset();
    });
  }

  if (done) {
    return (
      <p className="my-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        {successMessage}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="my-6 space-y-3">
      <label htmlFor="lead-email" className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="lead-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {pending ? "Sending…" : buttonLabel}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
