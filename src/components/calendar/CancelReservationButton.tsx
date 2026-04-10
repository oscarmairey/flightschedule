// FlightSchedule — confirmation modal wrapper around the reservation
// cancel button on /calendar.
//
// Why a client component: the page that renders the upcoming reservations
// list is a server component (it queries Prisma directly). Native <dialog>
// needs `showModal()`, which is browser-only — so we move the cancel
// trigger into this small client island. The actual cancellation still
// runs through the same `cancelReservationAction` server action; we just
// gate the form submit on a "Êtes-vous sûr ?" confirmation.

"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cancelReservationAction } from "@/app/calendar/actions";

type Props = {
  reservationId: string;
  /** Pre-formatted "13/04/2026 09:00" label shown inside the modal. */
  startsAtLabel: string;
};

export function CancelReservationButton({ reservationId, startsAtLabel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Annuler
      </Button>
      <Dialog ref={dialogRef} className="max-w-sm">
        <h3 className="font-display text-lg font-semibold text-text-strong">
          Êtes-vous sûr ?
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          La réservation du <span className="tabular font-semibold text-text">{startsAtLabel}</span> sera annulée. Cette action est définitive.
        </p>
        <form
          action={cancelReservationAction}
          className="mt-5 flex flex-wrap justify-end gap-2"
        >
          <input type="hidden" name="reservationId" value={reservationId} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dialogRef.current?.close()}
          >
            Retour
          </Button>
          <Button type="submit" variant="danger" size="sm">
            Confirmer l&apos;annulation
          </Button>
        </form>
      </Dialog>
    </>
  );
}
