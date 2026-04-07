// FlySchedule — Badge primitive.
//
// Variants:
//   - default: neutral pill
//   - balance: takes a `tier` ("green" | "amber" | "red") for HDV balance
//     coloring per PRD §3.4.1
//   - status: neutral with a colored dot (used for reservation/flight status)
//
// Every Badge pairs color with text — never color alone, per the
// design principle on color-blindness safety.

import type { ReactNode } from "react";
import { BALANCE_TIER_CLASSES, type BalanceTier } from "@/lib/duration";

export type BadgeProps = {
  children: ReactNode;
  tier?: BalanceTier;
  variant?: "default" | "info" | "warning" | "success" | "danger" | "brand";
  size?: "sm" | "md";
  className?: string;
};

const VARIANT_CLASSES = {
  default:
    "bg-surface-sunken text-text border-border",
  info:
    "bg-info-soft text-info-soft-fg border-info-soft-border",
  warning:
    "bg-warning-soft text-warning-soft-fg border-warning-soft-border",
  success:
    "bg-success-soft text-success-soft-fg border-success-soft-border",
  danger:
    "bg-danger-soft text-danger-soft-fg border-danger-soft-border",
  brand:
    "bg-brand-soft text-brand-soft-fg border-brand-soft-border",
} as const;

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-[0.7rem]",
  md: "px-2.5 py-1 text-xs",
} as const;

export function Badge({
  children,
  tier,
  variant = "default",
  size = "md",
  className = "",
}: BadgeProps) {
  const colors = tier ? BALANCE_TIER_CLASSES[tier] : VARIANT_CLASSES[variant];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium tracking-tight tabular ${colors} ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </span>
  );
}
