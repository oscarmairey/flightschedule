// FlySchedule — Button primitive.
//
// Mobile-first: default min-height 44px touch target (PRD §7.2).
// Variants: primary (sky-blue brand), secondary (warm surface),
// danger, ghost, link.

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "link";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand text-text-on-brand hover:bg-brand-hover active:bg-brand-strong shadow-[var(--shadow-brand)] hover:shadow-[var(--shadow-md)]",
  secondary:
    "bg-surface-elevated text-text border border-border hover:border-border-strong hover:bg-surface-soft shadow-xs",
  danger:
    "bg-danger text-white hover:opacity-90 shadow-xs",
  ghost:
    "bg-transparent text-text-muted hover:bg-surface-sunken hover:text-text",
  link:
    "bg-transparent text-brand hover:text-brand-hover underline-offset-4 hover:underline",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "min-h-9 px-3.5 py-1.5 text-sm rounded-md",
  md: "min-h-11 px-5 py-2.5 text-[0.95rem] rounded-md", // 44px tall — PRD touch target
  lg: "min-h-12 px-6 py-3 text-base rounded-lg",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium tracking-tight transition-all duration-150 ease-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
  return (
    <button
      {...rest}
      className={`${base} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}
