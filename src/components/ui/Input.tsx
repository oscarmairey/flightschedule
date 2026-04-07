// CAVOK — Input primitive.
//
// Mobile-first: 44px min-height, surfaces the numeric keyboard via
// `inputMode` for HH:MM and number fields (PRD §7.2).

import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ invalid = false, className = "", ...rest }: InputProps) {
  const base =
    "block w-full min-h-11 rounded-md border px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-1 dark:bg-zinc-900";
  const border = invalid
    ? "border-red-500 focus:border-red-500 focus:ring-red-500"
    : "border-zinc-300 focus:border-zinc-900 focus:ring-zinc-900 dark:border-zinc-700";
  return <input {...rest} className={`${base} ${border} ${className}`} />;
}
