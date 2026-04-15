// FlightSchedule — Select primitive.
//
// Mirrors the Input primitive: 44px min-height, warm-white surface,
// brand focus border, relies on the global `:focus-visible` rule in
// globals.css for the outline (no `focus:outline-none` override).
//
// Wraps a native <select>. All styling is kept consistent with Input
// so forms mixing inputs and selects don't look patchwork.

import type { SelectHTMLAttributes, ReactNode } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  children: ReactNode;
};

export function Select({
  invalid = false,
  className = "",
  children,
  ...rest
}: SelectProps) {
  const base =
    "block w-full min-h-11 rounded-md border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs transition-colors duration-150";
  const border = invalid
    ? "border-danger focus:border-danger"
    : "border-border hover:border-border-strong focus:border-brand";
  return (
    <select {...rest} className={`${base} ${border} ${className}`}>
      {children}
    </select>
  );
}
