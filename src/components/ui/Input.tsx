// FlySchedule — Input primitive.
//
// Mobile-first: 44px min-height, surfaces the numeric keyboard via
// `inputMode` for HH:MM and number fields (PRD §7.2). Uses design
// tokens so dark mode and brand-color changes flow through.

import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ invalid = false, className = "", ...rest }: InputProps) {
  const base =
    "block w-full min-h-11 rounded-md border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs transition-colors duration-150 focus:outline-none placeholder:text-text-subtle";
  const border = invalid
    ? "border-danger focus:border-danger focus-visible:outline-danger"
    : "border-border hover:border-border-strong focus:border-brand";
  return <input {...rest} className={`${base} ${border} ${className}`} />;
}
