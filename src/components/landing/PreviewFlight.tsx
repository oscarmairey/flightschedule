// Static flight entry preview for the landing page — decorative only.
// Shows a flight history card (LFPN → LFQQ) + engine time input preview.

import { Card } from "@/components/ui/Card";

export function PreviewFlight() {
  return (
    <div aria-hidden="true" role="img" aria-label="Aperçu de la saisie de vol FlightSchedule">
      {/* Flight card */}
      <Card>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tabular text-text-strong">
            LFPN
          </span>
          <span className="text-text-subtle">&#8594;</span>
          <span className="font-display text-2xl font-semibold tabular text-text-strong">
            LFQQ
          </span>
        </div>
        <p className="mt-1.5 text-base tabular text-text-muted">
          10/04/2026 &middot;{" "}
          <span className="font-semibold text-text">1h15</span> &middot;
          09:30 &#8594; 10:45
        </p>

      </Card>

      {/* Engine time preview */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-base font-medium text-text-subtle mb-1">
            Heure bloc OFF
          </p>
          <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-base tabular text-text">
            09:30
          </div>
        </div>
        <div>
          <p className="text-base font-medium text-text-subtle mb-1">
            Heure bloc ON
          </p>
          <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-base tabular text-text">
            10:45
          </div>
        </div>
      </div>
    </div>
  );
}
