"use client";

import { getCalApi } from "@calcom/embed-react";
import { useEffect, useState } from "react";

import { launchConfig } from "@/launch.config";
import { getDistinctId, track } from "@/lib/analytics/posthog-client";

const NAMESPACE = "launch-popup";

export interface BookingButtonProps {
  /** "acme/intro-call". Falls back to env config when omitted. */
  calLink?: string;
  label?: string;
  eventType?: string;
}

/**
 * Popup booking trigger, usable from any MDX page as <BookingButton />.
 *
 * Reads the Cal link from NEXT_PUBLIC_CAL_* at render time so MDX authors never
 * have to hard-code it. Renders nothing when Cal is unconfigured, rather than a
 * button that opens an empty modal.
 */
export function BookingButton({ calLink, label = "Book a call", eventType }: BookingButtonProps) {
  const [ready, setReady] = useState(false);

  const username = process.env.NEXT_PUBLIC_CAL_USERNAME;
  const slug = process.env.NEXT_PUBLIC_CAL_EVENT_SLUG;
  const link = calLink ?? (username && slug ? `${username}/${slug}` : null);
  const resolvedEventType = eventType ?? slug ?? "unknown";

  useEffect(() => {
    if (!link) return;
    void (async () => {
      const cal = await getCalApi({ namespace: NAMESPACE });
      cal("ui", { hideEventTypeDetails: false, layout: "month_view" });
      setReady(true);
    })();
  }, [link]);

  if (!link) return null;

  return (
    <button
      type="button"
      data-cal-namespace={NAMESPACE}
      data-cal-link={link}
      data-cal-config={JSON.stringify({
        layout: "month_view",
        metadata: {
          launch_slug: launchConfig.slug,
          posthog_distinct_id: getDistinctId() ?? "",
        },
      })}
      disabled={!ready}
      onClick={() => track("booking_started", { event_type: resolvedEventType })}
      className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {label}
    </button>
  );
}
