// FlightSchedule — confirm-before-submit button.
//
// Wraps a destructive server action in a native <dialog> confirmation.
// Replaces the ghost-trigger + <Dialog> + form pattern that
// CancelReservationButton coded by hand so we can apply it uniformly
// to every destructive action (deactivate pilot, reset password,
// promote admin, delete exception, archive package, …).
//
// The trigger button and the confirm button are each typed as Button
// variants so callers control visual weight independently. Hidden
// form fields are passed via the `hidden` prop so the server action
// receives the target id / context without the caller writing the
// <input type="hidden"> by hand.
//
// Server actions are passed from the server component above as props —
// Next.js 16 handles the client↔server boundary automatically.

"use client";

import { useRef, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

type Variant = NonNullable<ButtonProps["variant"]>;
type Size = NonNullable<ButtonProps["size"]>;

export type ConfirmButtonProps = {
  /** Server action invoked by the form inside the dialog. */
  formAction: (formData: FormData) => void | Promise<void>;
  /** Hidden fields to forward to the server action. */
  hidden?: Record<string, string>;

  // Trigger (the visible button on the page)
  triggerLabel: ReactNode;
  triggerVariant?: Variant;
  triggerSize?: Size;
  triggerDisabled?: boolean;
  /**
   * Render the trigger as a 36×36 icon-only square (hover: danger tint).
   * Use for delete trash cans. Requires `triggerAriaLabel`.
   */
  triggerIconOnly?: boolean;
  triggerAriaLabel?: string;

  // Dialog body
  title: string;
  body: ReactNode;

  // Confirm button (inside the dialog)
  confirmLabel: string;
  confirmVariant?: Variant;

  /** Cancel (return) button label. Defaults to "Annuler". */
  cancelLabel?: string;
};

export function ConfirmButton({
  formAction,
  hidden = {},
  triggerLabel,
  triggerVariant = "secondary",
  triggerSize = "md",
  triggerDisabled = false,
  triggerIconOnly = false,
  triggerAriaLabel,
  title,
  body,
  confirmLabel,
  confirmVariant = "danger",
  cancelLabel = "Annuler",
}: ConfirmButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      {triggerIconOnly ? (
        <button
          type="button"
          aria-label={triggerAriaLabel ?? "Confirmer"}
          disabled={triggerDisabled}
          onClick={() => dialogRef.current?.showModal()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triggerLabel}
        </button>
      ) : (
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          disabled={triggerDisabled}
          onClick={() => dialogRef.current?.showModal()}
        >
          {triggerLabel}
        </Button>
      )}
      <Dialog ref={dialogRef} className="max-w-sm">
        <h3 className="font-display text-lg font-semibold text-text-strong">
          {title}
        </h3>
        <div className="mt-2 text-sm leading-relaxed text-text-muted">
          {body}
        </div>
        <form
          action={formAction}
          className="mt-5 flex flex-wrap justify-end gap-2"
        >
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dialogRef.current?.close()}
          >
            {cancelLabel}
          </Button>
          <Button type="submit" variant={confirmVariant} size="sm">
            {confirmLabel}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
