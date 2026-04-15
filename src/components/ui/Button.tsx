// FlightSchedule — Button primitive.
//
// Mobile-first: default min-height 44px touch target (PRD §7.2).
// Variants: primary (sky-blue brand), secondary (warm surface),
// danger, ghost, ghost-danger (destructive icon trigger), link.
//
// Pass `iconOnly` for square icon buttons (trash cans, close, etc.).
// Enforces a square, padding-free shape at the same min-h as the size
// so touch targets stay ≥ 44px at size="md".
//
// `buttonClasses({ variant, size, iconOnly, fullWidth })` is exported
// so anchors / <Link> elements in landing-page hero CTAs can reuse the
// same token-driven visual language without hand-rolling a parallel set
// of classes. If you're styling a <button>, use <Button>; if you need
// an <a>/<Link> that *looks* like a button, use this helper on it.

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "ghost-danger"
  | "link";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand text-text-on-brand hover:bg-brand-hover active:bg-brand-strong shadow-[var(--shadow-brand)] hover:shadow-[var(--shadow-md)]",
  secondary:
    "bg-surface-elevated text-text border border-border hover:border-border-strong hover:bg-surface-soft shadow-xs",
  danger:
    "bg-danger text-text-on-danger hover:bg-danger-hover shadow-xs",
  ghost:
    "bg-transparent text-text-muted hover:bg-surface-sunken hover:text-text",
  "ghost-danger":
    "bg-transparent text-text-subtle hover:bg-danger-soft hover:text-danger",
  link:
    "bg-transparent text-brand hover:text-brand-hover underline-offset-4 hover:underline",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "min-h-9 px-3.5 py-1.5 text-sm rounded-md",
  md: "min-h-11 px-5 py-2.5 text-[0.95rem] rounded-md", // 44px tall — PRD touch target
  lg: "min-h-12 px-6 py-3 text-base rounded-lg",
  xl: "min-h-14 px-8 py-4 text-xl rounded-xl", // hero CTAs on the landing page
};

// Square shape for icon-only triggers. Width matches min-h so the button
// is a true square; padding is removed so the icon centers cleanly.
const SIZE_ICON_CLASSES: Record<Size, string> = {
  sm: "h-10 w-10 min-h-10 p-0 rounded-md", // 40×40 — dense list rows only
  md: "h-11 w-11 min-h-11 p-0 rounded-md", // 44×44 — canonical touch target
  lg: "h-12 w-12 min-h-12 p-0 rounded-lg", // 48×48
  xl: "h-14 w-14 min-h-14 p-0 rounded-xl", // 56×56 — unusual, but keeps the shape grid complete
};

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 font-medium tracking-tight transition-all duration-[var(--duration-fast)] ease-[var(--ease-out-ui)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export function buttonClasses({
  variant = "primary",
  size = "md",
  iconOnly = false,
  fullWidth = false,
  className = "",
}: {
  variant?: Variant;
  size?: Size;
  iconOnly?: boolean;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  const shape = iconOnly ? SIZE_ICON_CLASSES[size] : SIZE_CLASSES[size];
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${shape} ${
    fullWidth ? "w-full" : ""
  } ${className}`.trim();
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  /** Square icon-only button — width matches min-h, no horizontal padding. */
  iconOnly?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  iconOnly = false,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  // Focus ring is drawn by the global `:focus-visible` rule in globals.css
  // (2px brand outline with offset). No `focus:outline-none` here or
  // keyboard users lose the indicator entirely.
  return (
    <button
      {...rest}
      className={buttonClasses({ variant, size, iconOnly, fullWidth, className })}
    >
      {children}
    </button>
  );
}
