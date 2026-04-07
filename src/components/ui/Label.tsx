// FlySchedule — Label primitive.

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
      className={`block text-sm font-medium text-text-strong ${className}`}
    >
      {children}
      {required && (
        <span
          aria-hidden="true"
          className="ml-0.5 text-danger"
          title="obligatoire"
        >
          *
        </span>
      )}
    </label>
  );
}
