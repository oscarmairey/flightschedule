// FlightSchedule — Input primitive.
//
// Mobile-first: 44px min-height, surfaces the numeric keyboard via
// `inputMode` for HH:MM and number fields (PRD §7.2). Uses design
// tokens so dark mode and brand-color changes flow through.

import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ invalid = false, className = "", ...rest }: InputProps) {
  // Focus state: we let the global `:focus-visible` rule in globals.css
  // draw the brand outline (2px offset) for keyboard users. Pointer
  // focus leaves the border-only shift so the input doesn't strobe on
  // every tap. Do NOT add `focus:outline-none` here — that would kill
  // the global rule and leave keyboard users with no visible focus.
  const base =
    "block w-full min-h-11 rounded-md border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs transition-colors duration-150 placeholder:text-text-subtle";
  const border = invalid
    ? "border-danger focus:border-danger focus-visible:outline-danger"
    : "border-border hover:border-border-strong focus:border-brand";
  return <input {...rest} className={`${base} ${border} ${className}`} />;
}
