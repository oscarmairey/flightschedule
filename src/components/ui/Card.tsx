// CAVOK — Card primitive.
//
// Variants:
//   - elevated (default): warm white surface with soft shadow
//   - flush: borderless, no shadow — for sections that don't need a wrapper
//   - sunken: tinted background, used for nested content like remarks
//   - brand: brand-tinted soft surface for the hero HDV moment
//
// Per design principle "Don't wrap everything in cards" — prefer
// `flush` (or no Card at all) for sections that just need spacing.

import type { HTMLAttributes, ReactNode } from "react";

type Tone = "elevated" | "flush" | "sunken" | "brand";

const TONE_CLASSES: Record<Tone, string> = {
  elevated:
    "bg-surface-elevated border border-border-subtle shadow-sm",
  flush:
    "bg-transparent",
  sunken:
    "bg-surface-sunken border border-border-subtle",
  brand:
    "bg-brand-soft border border-brand-soft-border",
};

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  padded?: boolean;
  children: ReactNode;
};

export function Card({
  tone = "elevated",
  padded = true,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-lg ${TONE_CLASSES[tone]} ${
        padded ? "p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mb-5 ${className}`}>{children}</div>;
}

export function CardTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`text-base font-semibold tracking-tight text-text-strong ${className}`}>
      {children}
    </h2>
  );
}

export function CardDescription({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`mt-1 text-sm text-text-muted leading-relaxed ${className}`}>
      {children}
    </p>
  );
}
