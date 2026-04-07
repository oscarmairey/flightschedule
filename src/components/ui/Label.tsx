// CAVOK — Label primitive.

import type { LabelHTMLAttributes, ReactNode } from "react";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
  required?: boolean;
};

export function Label({
  children,
  required = false,
  className = "",
  ...rest
}: LabelProps) {
  return (
    <label
      {...rest}
      className={`block text-sm font-medium text-zinc-900 dark:text-zinc-100 ${className}`}
    >
      {children}
      {required && <span className="ml-0.5 text-red-600">*</span>}
    </label>
  );
}
