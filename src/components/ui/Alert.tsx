// FlightSchedule — Alert primitive.
//
// Replaces the inline banner pattern that was repeated across calendar,
// admin/flights, pilot detail, availability, account, login, etc. One
// canonical surface for "something happened" messaging.
//
// Tones map to design tokens:
//   - success: confirmation messages
//   - warning: non-blocking caution (e.g. balance approaching zero)
//   - error: validation failures, blocked operations
//   - info: neutral notifications, brand-tinted
//
// Pairs an icon with the color to satisfy the "color carries meaning,
// never alone" rule. Use `role="alert"` so screen readers announce.

import type { ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, TriangleAlert } from "lucide-react";

type Tone = "success" | "warning" | "error" | "info";

const TONE_CONFIG: Record<
  Tone,
  { className: string; Icon: typeof CheckCircle2; defaultLabel: string }
> = {
  success: {
    className: "bg-success-soft text-success-soft-fg border-success-soft-border",
    Icon: CheckCircle2,
    defaultLabel: "Succès",
  },
  warning: {
    className: "bg-warning-soft text-warning-soft-fg border-warning-soft-border",
    Icon: TriangleAlert,
    defaultLabel: "Avertissement",
  },
  error: {
    className: "bg-danger-soft text-danger-soft-fg border-danger-soft-border",
    Icon: AlertTriangle,
    defaultLabel: "Erreur",
  },
  info: {
    className: "bg-info-soft text-info-soft-fg border-info-soft-border",
    Icon: Info,
    defaultLabel: "Information",
  },
};

export type AlertProps = {
  tone: Tone;
  children: ReactNode;
  className?: string;
  /** Optional bold title rendered above the body. */
  title?: ReactNode;
  /**
   * Optional trailing slot — typically a dismiss button. Rendered at the
   * far end of the alert row, vertically centered with the icon.
   */
  action?: ReactNode;
};

export function Alert({
  tone,
  children,
  className = "",
  title,
  action,
}: AlertProps) {
  const { className: toneClass, Icon, defaultLabel } = TONE_CONFIG[tone];
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${toneClass} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        {title ? (
          <>
            <p className="font-semibold">
              <span className="sr-only">{defaultLabel}&nbsp;: </span>
              {title}
            </p>
            <div className="mt-0.5">{children}</div>
          </>
        ) : (
          <p>
            <span className="sr-only">{defaultLabel}&nbsp;: </span>
            {children}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
