import type { Metadata } from "next";

import { BookingEmbed } from "@/components/booking-embed";
import { launchConfig } from "@/launch.config";
import { calEventType, calLink } from "@/lib/cal";

export const metadata: Metadata = {
  title: "Book a call",
  description: `Find a time to talk about ${launchConfig.name}.`,
  alternates: { canonical: "/book" },
};

export default function BookPage() {
  const link = calLink();

  return (
    <div className="py-12">
      <h1 className="text-4xl font-bold tracking-tight">Book a call</h1>
      <p className="mt-4 max-w-2xl text-lg text-neutral-600 dark:text-neutral-400">
        Pick a slot that suits you — it goes straight into the calendar.
      </p>

      {link ? (
        <div className="mt-10 h-[70vh] min-h-[600px]">
          <BookingEmbed calLink={link} eventType={calEventType()} />
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 p-8 text-sm text-neutral-500 dark:border-neutral-700">
          <p className="font-medium text-neutral-700 dark:text-neutral-300">
            Scheduling isn&apos;t configured yet.
          </p>
          <p className="mt-2">
            Set <code className="font-mono">NEXT_PUBLIC_CAL_USERNAME</code> and{" "}
            <code className="font-mono">NEXT_PUBLIC_CAL_EVENT_SLUG</code> in{" "}
            <code className="font-mono">.env.local</code>, then reload. See docs/SETUP.md step 2.
          </p>
        </div>
      )}
    </div>
  );
}
