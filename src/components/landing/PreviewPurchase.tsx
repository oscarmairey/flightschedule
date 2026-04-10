// Static purchase preview for the landing page — decorative only.
// Shows a package selector + pay button with card/bank icons.

import { CreditCard, Landmark } from "lucide-react";

export function PreviewPurchase() {
  return (
    <div
      aria-hidden="true"
      role="img"
      aria-label="Aperçu de l'achat de forfaits HDV"
    >
      {/* Package rows */}
      <div className="space-y-2">
        <PackageRow name="Forfait 5h" hours="5h00" price="800 €" />
        <PackageRow
          name="Forfait 10h"
          hours="10h00"
          price="1 500 €"
          selected
        />
      </div>

      {/* CTA with payment method icons */}
      <div className="mt-4 flex gap-2">
        <div className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand py-3.5 text-base font-semibold text-text-on-brand shadow-[var(--shadow-brand)]">
          <CreditCard className="h-4 w-4" />
          Payer 1 800 &euro;
        </div>
        <div className="flex items-center justify-center rounded-lg border border-border bg-surface-elevated px-4 py-3.5 text-text-muted">
          <Landmark className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function PackageRow({
  name,
  hours,
  price,
  selected = false,
}: {
  name: string;
  hours: string;
  price: string;
  selected?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
        selected
          ? "border-brand bg-brand-soft"
          : "border-border-subtle bg-surface-elevated"
      }`}
    >
      <div>
        <p
          className={`text-base font-semibold ${
            selected ? "text-brand-soft-fg" : "text-text-strong"
          }`}
        >
          {name}
        </p>
        <p className="text-base text-text-muted">{hours}</p>
      </div>
      <p
        className={`font-display text-lg font-semibold tabular ${
          selected ? "text-brand-soft-fg" : "text-text"
        }`}
      >
        {price}
        <span className="ml-1 text-base font-medium text-text-muted">
          HT
        </span>
      </p>
    </div>
  );
}
