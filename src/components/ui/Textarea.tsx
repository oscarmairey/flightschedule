// FlightSchedule — Textarea primitive.
//
// Mirrors the Input primitive's tokens (border, surface, focus behavior)
// so mixed forms — Input + Select + Textarea — don't look patchwork.
// Used for remarks, flight corrections, and any multi-line free text.

import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({
  invalid = false,
  className = "",
  rows = 3,
  ...rest
}: TextareaProps) {
  // Focus behavior: same as Input — we rely on the global `:focus-visible`
  // rule in globals.css to draw the brand outline. Do NOT add
  // `focus:outline-none`.
  const base =
    "block w-full rounded-md border bg-surface-elevated px-3.5 py-2.5 text-base text-text shadow-xs transition-colors duration-150 placeholder:text-text-subtle resize-y min-h-24";
  const border = invalid
    ? "border-danger focus:border-danger focus-visible:outline-danger"
    : "border-border hover:border-border-strong focus:border-brand";
  return <textarea rows={rows} {...rest} className={`${base} ${border} ${className}`} />;
}
