// FlightSchedule — pilot new-flight form (client component).
//
// Wraps every input so we can:
//   1. Preserve user input across server-side validation errors. The
//      action returns `{ ok: false, error, values }` instead of
//      redirecting, and `useActionState` re-renders this component with
//      that state. React's `defaultValue` prop only initializes inputs
//      on mount — re-render after error doesn't wipe the typed values
//      because the inputs already hold them in DOM. <PhotoUpload> keeps
//      its own state and survives the same way.
//   2. Show a confirmation dialog with the flight summary before
//      submitting. The visible "Enregistrer" button is `type="button"`
//      and opens the native <dialog>; the dialog's "Confirmer" button
//      calls `formRef.current.requestSubmit()` which fires the
//      `useActionState` formAction.

"use client";

import { useActionState, useRef, useState } from "react";
import { COMMON_AIRPORTS } from "@/lib/airports";
import { COPY } from "@/lib/copy";
import { EngineTimesError, formatHHMM, parseEngineTimes } from "@/lib/duration";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PhotoUpload } from "@/components/flights/PhotoUpload";
import { FlightTimeFields } from "@/components/flights/FlightTimeFields";
import { submitFlight, type SubmitFlightState } from "@/app/flights/new/actions";

type Props = {
  defaultFlightDate: string; // YYYY-MM-DD (today, Paris-local)
};

type Summary = {
  date: string;
  dep: string;
  arr: string;
  blocOff: string;
  blocOn: string;
  duration: string;
  tachy: string | null;
  landings: string;
  photoCount: number;
  remarks: string;
};

function buildSummary(fd: FormData, defaultDate: string): Summary {
  const get = (k: string): string => {
    const v = fd.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const date = get("flightDate") || defaultDate;
  const dep = get("depAirport").toUpperCase();
  const arr = get("arrAirport").toUpperCase();
  const blocOff = get("engineStart");
  const blocOn = get("engineStop");
  let duration = "—";
  try {
    duration = formatHHMM(
      parseEngineTimes(date, blocOff, blocOn).durationMin,
    );
  } catch (err) {
    if (err instanceof EngineTimesError) duration = err.message;
  }
  const ts = get("tachyStart");
  const te = get("tachyStop");
  const tachy = ts || te ? `${ts || "—"} → ${te || "—"}` : null;
  const landings = get("landings") || "1";
  const photoCount = fd.getAll("photoKeys").filter((v) => typeof v === "string" && v).length;
  const remarks = get("remarks");
  // Display date as DD/MM/YYYY without pulling format.ts into the client bundle.
  const [y, m, d] = date.split("-");
  return {
    date: `${d}/${m}/${y}`,
    dep,
    arr,
    blocOff,
    blocOn,
    duration,
    tachy,
    landings,
    photoCount,
    remarks,
  };
}

export function NewFlightForm({ defaultFlightDate }: Props) {
  const [state, formAction, isPending] = useActionState<
    SubmitFlightState,
    FormData
  >(submitFlight, null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const v = state?.values;

  function onPreviewClick() {
    const f = formRef.current;
    if (!f) return;
    // Native required-field validation surfaces here — if any required
    // field is missing/invalid, the browser shows its own bubble and we
    // never open the dialog.
    if (!f.checkValidity()) {
      f.reportValidity();
      return;
    }
    setSummary(buildSummary(new FormData(f), defaultFlightDate));
    dialogRef.current?.showModal();
  }

  function onConfirmClick() {
    dialogRef.current?.close();
    // requestSubmit() dispatches a real submit event so React intercepts
    // it and runs the `formAction` returned by useActionState.
    formRef.current?.requestSubmit();
  }

  function onCancelClick() {
    dialogRef.current?.close();
  }

  return (
    <>
      {state?.error && (
        <div className="mb-6">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}

      <form ref={formRef} action={formAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Vol</CardTitle>
          </CardHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="flightDate" required>
                Date du vol
              </Label>
              <Input
                id="flightDate"
                name="flightDate"
                type="date"
                required
                defaultValue={v?.flightDate || defaultFlightDate}
                max={defaultFlightDate}
                className="tabular"
              />
              <p className="text-xs text-text-subtle">
                Date à laquelle le vol a eu lieu (pas de vol dans le futur).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="depAirport" required>
                Aéroport départ (OACI)
              </Label>
              <Input
                id="depAirport"
                name="depAirport"
                type="text"
                required
                maxLength={4}
                list="airports-list"
                placeholder="LFPN"
                defaultValue={v?.depAirport ?? ""}
                className="uppercase font-display tabular text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arrAirport" required>
                Aéroport arrivée (OACI)
              </Label>
              <Input
                id="arrAirport"
                name="arrAirport"
                type="text"
                required
                maxLength={4}
                list="airports-list"
                placeholder="LFPN"
                defaultValue={v?.arrAirport ?? ""}
                className="uppercase font-display tabular text-lg"
              />
            </div>
            <datalist id="airports-list">
              {COMMON_AIRPORTS.map((a) => (
                <option key={a.icao} value={a.icao}>
                  {a.name}
                </option>
              ))}
            </datalist>

            <FlightTimeFields
              defaultStart={v?.engineStart ?? ""}
              defaultStop={v?.engineStop ?? ""}
            />

            <div className="space-y-2">
              <Label htmlFor="tachyStart">TACHY départ</Label>
              <Input
                id="tachyStart"
                name="tachyStart"
                type="text"
                inputMode="decimal"
                placeholder="1234.56"
                pattern="\d{1,6}([.,]\d{1,2})?"
                defaultValue={v?.tachyStart ?? ""}
                className="tabular"
              />
              <p className="text-xs text-text-subtle">
                Relevé horamètre au bloc OFF (optionnel).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tachyStop">TACHY arrivée</Label>
              <Input
                id="tachyStop"
                name="tachyStop"
                type="text"
                inputMode="decimal"
                placeholder="1235.12"
                pattern="\d{1,6}([.,]\d{1,2})?"
                defaultValue={v?.tachyStop ?? ""}
                className="tabular"
              />
              <p className="text-xs text-text-subtle">
                Relevé horamètre au bloc ON (optionnel).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="landings" required>
                Atterrissages
              </Label>
              <Input
                id="landings"
                name="landings"
                type="number"
                required
                inputMode="numeric"
                defaultValue={v?.landings || "1"}
                min={1}
                max={99}
                className="tabular"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="remarks">Remarques</Label>
              <Textarea
                id="remarks"
                name="remarks"
                rows={3}
                maxLength={2000}
                defaultValue={v?.remarks ?? ""}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Photos du vol</Label>
              <PhotoUpload name="photoKeys" />
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            type="button"
            size="lg"
            onClick={onPreviewClick}
            disabled={isPending}
          >
            {isPending ? "Enregistrement…" : "Enregistrer le vol"}
          </Button>
        </div>
      </form>

      <Dialog ref={dialogRef} className="w-full max-w-md">
        <h3 className="font-display text-lg font-semibold text-text-strong">
          Confirmez votre saisie
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Vérifiez les informations avant l&apos;enregistrement. Un vol enregistré
          ne peut plus être modifié depuis votre compte.
        </p>

        {summary && (
          <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
            <dt className="text-text-subtle">Date</dt>
            <dd className="font-medium tabular text-text">{summary.date}</dd>

            <dt className="text-text-subtle">Trajet</dt>
            <dd className="font-display font-semibold tabular text-text-strong">
              {summary.dep} → {summary.arr}
            </dd>

            <dt className="text-text-subtle">Bloc OFF / ON</dt>
            <dd className="font-medium tabular text-text">
              {summary.blocOff} → {summary.blocOn}
            </dd>

            <dt className="text-text-subtle">Durée</dt>
            <dd className="font-semibold tabular text-text-strong">
              {summary.duration}
            </dd>

            {summary.tachy && (
              <>
                <dt className="text-text-subtle">TACHY</dt>
                <dd className="font-medium tabular text-text">{summary.tachy}</dd>
              </>
            )}

            <dt className="text-text-subtle">Atterrissages</dt>
            <dd className="font-medium tabular text-text">{summary.landings}</dd>

            <dt className="text-text-subtle">Photos</dt>
            <dd className="text-text">
              {summary.photoCount === 0
                ? "Aucune"
                : `${summary.photoCount} jointe${summary.photoCount > 1 ? "s" : ""}`}
            </dd>

            <dt className="text-text-subtle">Remarques</dt>
            <dd className="whitespace-pre-wrap break-words text-text">
              {summary.remarks || "—"}
            </dd>
          </dl>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancelClick}>
            {COPY.common.cancel}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={onConfirmClick}>
            Valider
          </Button>
        </div>
      </Dialog>
    </>
  );
}
