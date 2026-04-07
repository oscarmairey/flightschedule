// CAVOK — Badge primitive.
//
// Variants:
//   - default: neutral pill
//   - balance: takes a `tier` ("green" | "amber" | "red") for HDV balance
//     coloring per PRD §3.4.1
//   - status: neutral with a colored dot (used for reservation/flight status)

import type { ReactNode } from "react";
import { BALANCE_TIER_CLASSES, type BalanceTier } from "@/lib/duration";

export type BadgeProps = {
  children: ReactNode;
  tier?: BalanceTier;
  variant?: "default" | "info" | "warning" | "success" | "danger";
  className?: string;
};

const VARIANT_CLASSES = {
  default: "bg-zinc-100 text-zinc-900 border-zinc-300",
  info: "bg-blue-100 text-blue-900 border-blue-300",
  warning: "bg-amber-100 text-amber-900 border-amber-300",
  success: "bg-emerald-100 text-emerald-900 border-emerald-300",
  danger: "bg-red-100 text-red-900 border-red-300",
} as const;

export function Badge({ children, tier, variant = "default", className = "" }: BadgeProps) {
  const colors = tier ? BALANCE_TIER_CLASSES[tier] : VARIANT_CLASSES[variant];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors} ${className}`}
    >
      {children}
    </span>
  );
}
