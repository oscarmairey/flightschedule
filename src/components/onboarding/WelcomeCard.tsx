// FlightSchedule — single card on the /welcome screen.
//
// Composes Card + Button into a vertical step layout. Each card has:
//   - a step kicker ("Étape 1 / 3")
//   - a brand-coloured icon
//   - a headline
//   - a body slot (children)
//   - one CTA — either an in-page anchor (cards 1 & 2 → next card)
//     or a form submission (card 3 → completes the onboarding action).
//
// Server component — accepts an optional `formAction` for the final card.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { buttonClasses } from "@/components/ui/Button";
import { COPY } from "@/lib/copy";

type Props = {
  step: 1 | 2 | 3;
  totalSteps: number;
  id: string;
  icon: LucideIcon;
  title: ReactNode;
  children: ReactNode;
  ctaLabel: string;
  /**
   * Anchor href for cards that scroll to the next step. Mutually
   * exclusive with `formAction`.
   */
  ctaHref?: string;
  /**
   * Server action posted by the final card's form. When supplied, the
   * CTA renders as a submit button; otherwise as an anchor link.
   */
  formAction?: (formData: FormData) => void | Promise<void>;
};

export function WelcomeCard({
  step,
  totalSteps,
  id,
  icon: Icon,
  title,
  children,
  ctaLabel,
  ctaHref,
  formAction,
}: Props) {
  return (
    <Card
      id={id}
      tone={step === 1 ? "brand" : "elevated"}
      className="scroll-mt-6 p-7 sm:p-8"
    >
      <p className="text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
        {COPY.onboarding.stepLabel
          .replace("{n}", String(step))
          .replace("{total}", String(totalSteps))}
      </p>
      <div className="mt-4 flex items-start gap-4">
        <span
          aria-hidden="true"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-text-on-brand shadow-[var(--shadow-brand)]"
        >
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          {title}
        </h2>
      </div>
      <div className="mt-5 space-y-3 text-base leading-relaxed text-text-muted">
        {children}
      </div>
      <div className="mt-7">
        {formAction ? (
          <form action={formAction}>
            <SubmitButton size="lg" fullWidth pendingLabel={`${ctaLabel}…`}>
              {ctaLabel}
            </SubmitButton>
          </form>
        ) : (
          ctaHref && (
            <a
              href={ctaHref}
              className={buttonClasses({
                variant: "primary",
                size: "lg",
                fullWidth: true,
              })}
            >
              {ctaLabel}
            </a>
          )
        )}
      </div>
    </Card>
  );
}
