"use client";

import Cal, { getCalApi } from "@calcom/embed-react";
import { useEffect, useRef } from "react";

import { launchConfig } from "@/launch.config";
import { getDistinctId, track } from "@/lib/analytics/posthog-client";

const NAMESPACE = "launch-inline";

export interface BookingEmbedProps {
  calLink: string;
  eventType: string;
  /** Prefilled when the visitor is already a known lead. */
  name?: string;
  email?: string;
}

/**
 * Inline Cal.com embed for /book.
 *
 * `metadata.posthog_distinct_id` rides through the booking and comes back on
 * the Cal webhook, so the server-side `booking_completed` lands on the same
 * PostHog person who opened the embed.
 */
export function BookingEmbed({ calLink, eventType, name, email }: BookingEmbedProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      track("booking_started", { event_type: eventType });
    }

    void (async () => {
      const cal = await getCalApi({ namespace: NAMESPACE });
      cal("ui", { hideEventTypeDetails: false, layout: "month_view" });
    })();
  }, [eventType]);

  return (
    <Cal
      namespace={NAMESPACE}
      calLink={calLink}
      style={{ width: "100%", height: "100%", overflow: "scroll" }}
      config={{
        layout: "month_view",
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        metadata: {
          launch_slug: launchConfig.slug,
          posthog_distinct_id: getDistinctId() ?? "",
        },
      }}
    />
  );
}
