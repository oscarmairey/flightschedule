// Static calendar preview for the landing page — decorative only.
// Shows a 5-day × 4-row week grid excerpt with sample bookings.

const DAYS = [
  { abbr: "Lun", date: "14" },
  { abbr: "Mar", date: "15" },
  { abbr: "Mer", date: "16", today: true },
  { abbr: "Jeu", date: "17" },
  { abbr: "Ven", date: "18" },
];

const TIMES = ["00h", "03h", "06h", "09h", "12h", "15h", "18h", "21h"];

type SlotKind = "available" | "own" | "other" | "unavailable";

// Row-major: slots[rowIdx][colIdx]
const SLOTS: { kind: SlotKind; label?: string; sub?: string }[][] = [
  // 00h row
  [
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
  ],
  // 03h row
  [
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
  ],
  // 06h row
  [
    { kind: "available" },
    { kind: "available" },
    { kind: "unavailable" },
    { kind: "available" },
    { kind: "available" },
  ],
  // 09h row
  [
    { kind: "available" },
    { kind: "own", label: "P. Martin", sub: "09:00 – 12:00" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
  ],
  // 12h row
  [
    { kind: "available" },
    { kind: "own" },
    { kind: "available" },
    { kind: "other", label: "J. Dupont", sub: "12:00 – 15:00" },
    { kind: "available" },
  ],
  // 15h row
  [
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "other" },
    { kind: "own", label: "Vous", sub: "15:00 – 18:00" },
  ],
  // 18h row
  [
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
  ],
  // 21h row
  [
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
    { kind: "available" },
  ],
];

const SLOT_STYLES: Record<SlotKind, string> = {
  available: "bg-surface-elevated border-border-subtle",
  own: "bg-brand text-text-on-brand",
  other: "bg-text-muted/15",
  unavailable: "bg-danger-soft/60",
};

export function PreviewCalendar() {
  return (
    <div aria-hidden="true" role="img" aria-label="Aperçu du calendrier FlightSchedule">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border-subtle bg-surface-soft px-4 py-2.5 text-base text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-border-subtle bg-surface-elevated" />
          Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-brand" />
          Vos réservations
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-text-muted/15" />
          Autre pilote
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-danger-soft/60" />
          Indisponible
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          {/* Day headers */}
          <div
            className="grid border-b border-border-subtle"
            style={{ gridTemplateColumns: "48px repeat(5, 1fr)" }}
          >
            <div />
            {DAYS.map((d) => (
              <div
                key={d.abbr}
                className={`py-2.5 text-center ${
                  d.today ? "bg-brand-soft" : ""
                }`}
              >
                <p
                  className={`text-base font-medium uppercase tracking-wider ${
                    d.today ? "text-brand" : "text-text-subtle"
                  }`}
                >
                  {d.abbr}
                </p>
                <p
                  className={`font-display text-lg font-semibold tabular ${
                    d.today ? "text-brand" : "text-text-strong"
                  }`}
                >
                  {d.date}
                </p>
              </div>
            ))}
          </div>

          {/* Slot rows */}
          {TIMES.map((time, rowIdx) => (
            <div
              key={time}
              className="grid border-b border-border-subtle last:border-b-0"
              style={{ gridTemplateColumns: "48px repeat(5, 1fr)" }}
            >
              <div className="flex items-start justify-end pr-2 pt-2 text-base font-medium tabular text-text-subtle">
                {time}
              </div>
              {SLOTS[rowIdx].map((slot, colIdx) => (
                <div
                  key={colIdx}
                  className={`relative min-h-[3.5rem] border-l border-border-subtle ${SLOT_STYLES[slot.kind]} ${
                    DAYS[colIdx].today && slot.kind === "available"
                      ? "bg-brand-soft/30"
                      : ""
                  }`}
                >
                  {slot.label && (
                    <div className="absolute inset-x-1.5 top-1.5">
                      <p className="text-base font-semibold leading-tight">
                        {slot.label}
                      </p>
                      {slot.sub && (
                        <p className="text-base leading-tight opacity-80 mt-0.5">
                          {slot.sub}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
