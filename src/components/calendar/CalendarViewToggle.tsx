// FlightSchedule — calendar view-mode toggle (Semaine / Mois).
//
// Two segmented links — server-rendered, no client JS. The active mode
// is determined by the parent's `?view=` param and passed as `current`.
// Each link points to the same base path with the opposite ?view value
// (and resets any view-specific params like ?week / ?month so the page
// can default to "current week" / "current month").

import Link from "next/link";

type View = "week" | "month";

type Props = {
  current: View;
  weekHref: string; // full href to switch to week view (e.g. "/calendar?view=week")
  monthHref: string; // full href to switch to month view
};

export function CalendarViewToggle({ current, weekHref, monthHref }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Vue du calendrier"
      className="inline-flex overflow-hidden rounded-md border border-border bg-surface-elevated text-sm shadow-xs"
    >
      <Link
        href={weekHref}
        role="tab"
        aria-selected={current === "week"}
        scroll={false}
        className={`px-3.5 py-1.5 font-medium transition-colors ${
          current === "week"
            ? "bg-brand text-text-on-brand"
            : "text-text-muted hover:bg-surface-sunken hover:text-text"
        }`}
      >
        Semaine
      </Link>
      <Link
        href={monthHref}
        role="tab"
        aria-selected={current === "month"}
        scroll={false}
        className={`border-l border-border px-3.5 py-1.5 font-medium transition-colors ${
          current === "month"
            ? "bg-brand text-text-on-brand"
            : "text-text-muted hover:bg-surface-sunken hover:text-text"
        }`}
      >
        Mois
      </Link>
    </div>
  );
}
