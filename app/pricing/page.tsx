import type { Metadata } from "next";

import { PricingTable } from "@/components/pricing-table";
import { launchConfig } from "@/launch.config";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Plans and pricing for ${launchConfig.name}.`,
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <div className="py-12">
      <h1 className="text-4xl font-bold tracking-tight">Pricing</h1>
      <p className="mt-4 max-w-2xl text-lg text-neutral-600 dark:text-neutral-400">
        Straightforward plans. Cancel any time.
      </p>

      <PricingTable plans={launchConfig.plans} />
    </div>
  );
}
