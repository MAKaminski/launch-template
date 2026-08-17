"use client";

import { useEffect, useState } from "react";

import type { PricingPlan } from "@/launch.config";
import { getDistinctId, track } from "@/lib/analytics/posthog-client";

export interface PricingTableProps {
  plans: PricingPlan[];
}

function formatPrice(plan: PricingPlan): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
    minimumFractionDigits: plan.amountCents % 100 === 0 ? 0 : 2,
  }).format(plan.amountCents / 100);

  if (plan.interval === "one_time") return amount;
  return `${amount}/${plan.interval === "month" ? "mo" : "yr"}`;
}

export function PricingTable({ plans }: PricingTableProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("pricing_viewed", { plan_ids: plans.map((plan) => plan.key) });
  }, [plans]);

  async function startCheckout(plan: PricingPlan): Promise<void> {
    setError(null);
    setPendingKey(plan.key);

    track("checkout_started", {
      price_id: plan.priceId ?? "unconfigured",
      amount_cents: plan.amountCents,
      plan_key: plan.key,
    });

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the plan KEY crosses the wire. The server maps key → priceId
        // from launch.config.ts, so a tampered request cannot alter the price.
        body: JSON.stringify({ planKey: plan.key, distinctId: getDistinctId() }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Checkout is unavailable right now.";
        setError(message);
        setPendingKey(null);
        return;
      }

      if (data && typeof data === "object" && "url" in data) {
        // assign() rather than `location.href = …`: the React Compiler lint
        // treats assigning to a value defined outside the component as a
        // mutation. Same navigation, same history behaviour.
        window.location.assign(String((data as { url: unknown }).url));
        return;
      }

      setError("Checkout is unavailable right now.");
      setPendingKey(null);
    } catch {
      setError("Network error. Please try again.");
      setPendingKey(null);
    }
  }

  return (
    <section className="my-10">
      <div className="grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.key}
            className={`flex flex-col rounded-xl border p-6 ${
              plan.highlighted
                ? "border-neutral-900 dark:border-neutral-100"
                : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {plan.description}
            </p>
            <p className="mt-4 text-3xl font-bold tracking-tight">{formatPrice(plan)}</p>

            <ul className="mt-5 flex-1 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              {plan.features.map((feature) => (
                <li key={feature}>· {feature}</li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => void startCheckout(plan)}
              disabled={pendingKey !== null || plan.priceId === null}
              className="mt-6 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {plan.priceId === null
                ? "Not yet configured"
                : pendingKey === plan.key
                  ? "Redirecting…"
                  : `Choose ${plan.name}`}
            </button>

            {plan.priceId === null ? (
              <p className="mt-2 text-xs text-neutral-500">
                Add this plan&apos;s Stripe Price ID to launch.config.ts to enable checkout.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  );
}
