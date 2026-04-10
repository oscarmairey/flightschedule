// Static dashboard preview for the landing page — decorative only.
// Shows a branded HDV balance card + 3 stat cards with hardcoded data.

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function PreviewDashboard() {
  return (
    <div aria-hidden="true" role="img" aria-label="Aperçu du tableau de bord FlightSchedule">
      <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
        {/* Hero balance card */}
        <Card tone="brand" padded={false} className="relative overflow-hidden p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-medium uppercase tracking-widest text-brand-soft-fg/80">
              Solde HDV
            </p>
          </div>

          <p className="mt-2 font-display leading-none tracking-tight">
            <span className="text-[clamp(3rem,10vw,4.5rem)] font-semibold text-success">
              12
            </span>
            <span className="text-[clamp(1.5rem,5vw,2.25rem)] font-semibold text-text-strong/30">
              h
            </span>
            <span className="text-[clamp(2rem,6vw,3rem)] font-semibold text-text-strong/70">
              30
            </span>
          </p>

          <p className="mt-2 text-base leading-relaxed text-text-muted">
            Heures de vol disponibles.
          </p>
        </Card>

        {/* Stat cards */}
        <div className="flex flex-col gap-2">
          <StatCard label="Heures de Vol" value="142h30" />
          <StatCard label="Vols" value="47" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-1 flex-col justify-center py-3 px-4">
      <p className="text-base font-medium uppercase tracking-widest text-text-subtle">
        {label}
      </p>
      <p className="font-display text-3xl font-semibold tabular text-text-strong leading-tight mt-0.5">
        {value}
      </p>
    </Card>
  );
}
