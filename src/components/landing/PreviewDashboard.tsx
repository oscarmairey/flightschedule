// Static dashboard preview for the landing page — decorative only.
// Kept in lockstep with the real /dashboard layout: brand HDV hero +
// three stat cards (HDV {year}, Total HDV, Vols).

import { TrendingUp, Plane, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function PreviewDashboard() {
  return (
    <div aria-hidden="true" role="img" aria-label="Aperçu du tableau de bord FlightSchedule">
      <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
        {/* Hero balance card — matches /dashboard hero styling */}
        <Card tone="brand" padded={false} className="relative overflow-hidden p-5 sm:p-6">
          <p className="text-base font-medium uppercase tracking-widest text-brand-soft-fg/80">
            Solde HDV
          </p>

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

        {/* Stat cards — identical count + labels to the real dashboard */}
        <div className="flex flex-col gap-2">
          <StatCard Icon={TrendingUp} label="HDV 2026" value="24h15" />
          <StatCard Icon={Plane} label="Total HDV" value="142h30" />
          <StatCard Icon={BookOpen} label="Vols" value="47" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  Icon,
  label,
  value,
}: {
  Icon: typeof TrendingUp;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex flex-1 flex-col justify-center py-3 px-4">
      <div className="flex items-center gap-1.5 text-text-subtle">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-base font-medium uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p className="font-display text-2xl font-semibold tabular text-text-strong leading-tight mt-0.5">
        {value}
      </p>
    </Card>
  );
}
