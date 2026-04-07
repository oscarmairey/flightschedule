// CAVOK — Dialog primitive built on the native <dialog> element.
//
// Why native: zero JS deps, accessible by default (focus trap, escape
// to close, backdrop click via the ::backdrop pseudo-element). Fits
// the "no extra deps" rule.
//
// Usage: import the ref-imperative wrapper from a client component,
// open via `dialogRef.current?.showModal()`. The dialog shows its
// children verbatim — caller controls layout and close behavior.

"use client";

import { forwardRef, type ReactNode } from "react";

export type DialogProps = {
  children: ReactNode;
  className?: string;
};

export const Dialog = forwardRef<HTMLDialogElement, DialogProps>(
  function Dialog({ children, className = "" }, ref) {
    return (
      <dialog
        ref={ref}
        className={`rounded-xl border border-border bg-surface-elevated p-6 text-text shadow-lg backdrop:bg-text/30 backdrop:backdrop-blur-sm ${className}`}
      >
        {children}
      </dialog>
    );
  },
);
