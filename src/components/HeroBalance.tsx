// FlightSchedule — canonical HDV balance display.
//
// Before Pass 2.1 the balance was rendered three different ways:
//   /dashboard         — huge "12h30" with a dim "h" and smaller minutes
//   /admin/pilots/[id] — plain formatHHMM(…)
//   /checkout/success  — plain formatHHMM(…)
//
// This component unifies them. The split-opacity treatment is the brand
// moment and is used everywhere the balance is the hero of the page.
// Pass a `size` prop to tune for dashboard (xl), checkout (lg), or admin
// (md) contexts. The wrapper is caller-owned so pages can put it inside
// whatever Card/section they want.
//
// Label + tier Badge are rendered by this component so the "color +
// text" rule (architectural UI rule: color never carries meaning alone)
// is enforced in one place.

import { Badge } from "@/components/ui/Badge";
import {
  balanceTier,
  BALANCE_TIER_FG_CLASSES,
  BALANCE_TIER_LABELS,
  type BalanceTier,
} from "@/lib/duration";

type Size = "xl" | "lg" | "md";

const NUMERAL_CLASSES: Record<Size, { hours: string; h: string; minutes: string }> = {
  xl: {
    hours: "text-[clamp(4.5rem,14vw,7rem)]",
    h: "text-[0.5em]",
    minutes: "text-[0.5em]",
  },
  lg: {
    hours: "text-6xl sm:text-7xl",
    h: "text-[0.55em]",
    minutes: "text-[0.55em]",
  },
  md: {
    hours: "text-4xl sm:text-5xl",
    h: "text-[0.6em]",
    minutes: "text-[0.6em]",
  },
};

export function HeroBalance({
  balanceMin,
  label,
  size = "xl",
  align = "left",
  showTier = true,
}: {
  balanceMin: number;
  /** Eyebrow label above the numeral. Defaults to "Solde HDV". */
  label?: string;
  size?: Size;
  align?: "left" | "right";
  showTier?: boolean;
}) {
  const tier: BalanceTier = balanceTier(balanceMin);
  const tierFg = BALANCE_TIER_FG_CLASSES[tier];
  const tierLabel = BALANCE_TIER_LABELS[tier];

  const abs = Math.abs(balanceMin);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const sign = balanceMin < 0 ? "−" : "";

  const sizeClasses = NUMERAL_CLASSES[size];
  const alignClass = align === "right" ? "text-right" : "text-left";

  return (
    <div className={alignClass}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-text-subtle">
        {label ?? "Solde HDV"}
      </p>
      <p
        className={`font-display tabular mt-2 font-semibold leading-none tracking-tight ${tierFg}`}
      >
        {/* The hours span owns the font-size; "h" and minutes are nested
            so their `em`-based sizes resolve against the hours numeral,
            not the paragraph's inherited 1rem (which would make them
            ~8px). Keep them as children, not siblings. */}
        <span className={sizeClasses.hours}>
          {sign}
          {hours}
          <span className={`text-text-strong/30 ${sizeClasses.h}`}>h</span>
          <span className={`text-text-strong/70 ${sizeClasses.minutes}`}>
            {minutes.toString().padStart(2, "0")}
          </span>
        </span>
      </p>
      {showTier && (
        <div className={`mt-3 ${align === "right" ? "flex justify-end" : ""}`}>
          <Badge tier={tier}>
            <span aria-hidden="true">●</span>
            {tierLabel}
          </Badge>
        </div>
      )}
    </div>
  );
}
