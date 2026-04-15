// FlightSchedule — form submit button that reflects server-action state.
//
// React's `useFormStatus()` tells the nearest enclosing <form> when a
// submission is in flight. We use it to disable the button and swap
// its label to a processing string so the pilot gets feedback between
// the tap and the server redirect — otherwise a slow airfield
// connection looks like a dead app.
//
// Must be a client component; the parent form can still be a server
// component.

"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/Button";

type Props = Omit<ButtonProps, "type" | "disabled"> & {
  /** Label swapped in while the form is pending. */
  pendingLabel?: string;
};

export function SubmitButton({
  children,
  pendingLabel = "Envoi en cours…",
  ...rest
}: Props) {
  const { pending } = useFormStatus();
  return (
    <Button {...rest} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
