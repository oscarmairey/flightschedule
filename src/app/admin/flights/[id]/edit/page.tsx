// FlightSchedule — /admin/flights/[id]/edit — admin flight correction.
//
// Pilots cannot edit their own flights (rule #9). Admins can — this is
// the only place in the app that touches Flight rows after insert. The
// HDV cascade is handled by the action via a compensating
// ADMIN_ADJUSTMENT row; see actions.ts for the strategy + reasoning.
//
// Photos are read-only here on purpose. Edit-pass scope is the engine
// times, airports, date, landings, tach readings, and remarks. If a
// photo needs swapping the operator can ask for that next.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { COMMON_AIRPORTS } from "@/lib/airports";
import { formatHHMM, formatTachy } from "@/lib/duration";
import { formatDateFR, formatDateTimeFR, parisLocalDateString } from "@/lib/format";
import { presignGetUrl } from "@/lib/r2";
import { resolveBanner } from "@/lib/banners";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AppShell } from "@/components/AppShell";
import { updateFlightAsAdmin } from "./actions";

export default async function AdminEditFlightPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; msg?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const flight = await prisma.flight.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!flight) notFound();

  // Net balance across all type wallets — surfaced in the header as
  // context for the admin before they correct the flight.
  const pilotBalanceAgg = await prisma.userFlightHourBalance.aggregate({
    where: { userId: flight.user.id },
    _sum: { balanceMin: true },
  });
  const pilotNetMin = pilotBalanceAgg._sum.balanceMin ?? 0;

  // Photo presign — same pattern as FlightHistory. Failed presigns
  // become "?" placeholders so a single missing blob doesn't break
  // the page.
  const photoUrlMap = new Map<string, string>();
  await Promise.all(
    flight.photos.map(async (key) => {
      try {
        const url = await presignGetUrl(key);
        photoUrlMap.set(key, url);
      } catch (err) {
        console.error("[admin/flights/edit] presignGetUrl failed for", key, err);
      }
    }),
  );

  // Compensating ADMIN_ADJUSTMENT rows for *this* flight, oldest first.
  // Surfaces the audit trail of past edits to whoever is about to make
  // a new one.
  const corrections = await prisma.transaction.findMany({
    where: {
      flightId: flight.id,
      type: "ADMIN_ADJUSTMENT",
    },
    orderBy: { createdAt: "asc" },
    include: { performedBy: { select: { name: true } } },
  });

  const banner = resolveBanner(sp, {
    "error:engine": {
      tone: "error",
      msg: (s) => s.msg ?? "Heures bloc OFF / bloc ON invalides.",
    },
    "error:invalid": { tone: "error", msg: COPY.errors.invalidInput },
  });

  // Default the date <input type="date"> value from the stored Flight.date.
  // Flight.date is the Paris-local calendar day at midnight UTC, but to
  // be safe we re-derive the YYYY-MM-DD via the Paris formatter.
  const dateValue = parisLocalDateString(flight.date);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/admin/pilots/${flight.user.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {flight.user.name}
        </Link>

        <header className="mt-4 mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            Correction administrateur
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {flight.depAirport} → {flight.arrAirport}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-muted">
            Modifier les valeurs de ce vol. Toute variation de la durée
            sera répercutée immédiatement sur le solde HDV de{" "}
            <span className="font-semibold text-text">{flight.user.name}</span>{" "}
            via une écriture compensatoire dans l&apos;historique.
          </p>
          <p className="mt-2 text-xs tabular text-text-subtle">
            Saisi le {formatDateTimeFR(flight.createdAt)}
            <span className="mx-2">·</span>
            durée actuelle{" "}
            <span className="font-semibold text-text">
              {formatHHMM(flight.actualDurationMin)}
            </span>
            <span className="mx-2">·</span>
            solde du pilote (net)&nbsp;
            <span className="font-semibold text-text">
              {formatHHMM(pilotNetMin)}
            </span>
          </p>
        </header>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        <form action={updateFlightAsAdmin} className="space-y-6">
          <input type="hidden" name="flightId" value={flight.id} />

          <Card>
            <CardHeader>
              <CardTitle>Vol</CardTitle>
              <CardDescription>
                Les heures bloc OFF / bloc ON déterminent la durée et le
                décompte HDV.
              </CardDescription>
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
                  defaultValue={dateValue}
                  className="tabular"
                />
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
                  defaultValue={flight.depAirport}
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
                  defaultValue={flight.arrAirport}
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

              <div className="space-y-2">
                <Label htmlFor="engineStart" required>
                  {COPY.flight.blocOff}
                </Label>
                <Input
                  id="engineStart"
                  name="engineStart"
                  type="time"
                  step="60"
                  required
                  defaultValue={flight.engineStart}
                  className="tabular"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="engineStop" required>
                  {COPY.flight.blocOn}
                </Label>
                <Input
                  id="engineStop"
                  name="engineStop"
                  type="time"
                  step="60"
                  required
                  defaultValue={flight.engineStop}
                  className="tabular"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tachyStart">TACHY départ</Label>
                <Input
                  id="tachyStart"
                  name="tachyStart"
                  type="text"
                  inputMode="decimal"
                  placeholder="1234.56"
                  pattern="\d{1,6}([.,]\d{1,2})?"
                  defaultValue={
                    flight.tachyStartHundredths !== null
                      ? formatTachy(flight.tachyStartHundredths)
                      : ""
                  }
                  className="tabular"
                />
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
                  defaultValue={
                    flight.tachyStopHundredths !== null
                      ? formatTachy(flight.tachyStopHundredths)
                      : ""
                  }
                  className="tabular"
                />
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
                  defaultValue={flight.landings}
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
                  defaultValue={flight.remarks ?? ""}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Motif de la correction</CardTitle>
              <CardDescription>
                Apparaîtra dans l&apos;historique HDV du pilote et sert
                d&apos;audit trail. Obligatoire.
              </CardDescription>
            </CardHeader>
            <div className="space-y-2">
              <Label htmlFor="reason" required>
                Raison
              </Label>
              <Input
                id="reason"
                name="reason"
                type="text"
                required
                minLength={3}
                maxLength={1000}
                placeholder="ex : bloc ON corrigé d'après le carnet de route papier"
              />
            </div>
          </Card>

          {flight.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Photos du carnet de bord</CardTitle>
                <CardDescription>
                  Affichage seul. La gestion des photos n&apos;est pas
                  encore disponible côté admin.
                </CardDescription>
              </CardHeader>
              <div className="flex flex-wrap gap-3">
                {flight.photos.map((key) => {
                  const url = photoUrlMap.get(key);
                  if (!url) {
                    return (
                      <div
                        key={key}
                        className="flex h-20 w-20 items-center justify-center rounded-md border border-border bg-surface-sunken text-xs text-text-subtle"
                        aria-label="Photo indisponible"
                      >
                        ?
                      </div>
                    );
                  }
                  return (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-20 w-20 overflow-hidden rounded-md border border-border transition-all hover:border-brand hover:shadow-md"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Photo carnet de bord du vol ${flight.depAirport} → ${flight.arrAirport}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  );
                })}
              </div>
            </Card>
          )}

          {corrections.length > 0 && (
            <Card tone="sunken">
              <CardHeader>
                <CardTitle>Corrections antérieures</CardTitle>
                <CardDescription>
                  Écritures compensatoires déjà appliquées à ce vol.
                </CardDescription>
              </CardHeader>
              <ul className="divide-y divide-border-subtle">
                {corrections.map((c) => {
                  const sign = c.amountMin >= 0 ? "+" : "−";
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs tabular text-text-subtle">
                          {formatDateTimeFR(c.createdAt)}
                          <span className="mx-1.5">·</span>
                          {c.performedBy.name}
                        </p>
                        {c.reference && (
                          <p className="mt-0.5 truncate text-text">
                            {c.reference}
                          </p>
                        )}
                      </div>
                      <p
                        className={`tabular shrink-0 font-semibold ${
                          c.amountMin >= 0 ? "text-success" : "text-text"
                        }`}
                      >
                        {sign}
                        {formatHHMM(Math.abs(c.amountMin))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/admin/pilots/${flight.user.id}`}
              className="text-sm font-medium text-text-muted transition-colors hover:text-brand"
            >
              {COPY.common.cancel}
            </Link>
            <SubmitButton size="lg" pendingLabel="Enregistrement…">
              Appliquer la correction
            </SubmitButton>
          </div>
        </form>

        <p className="mt-8 text-xs text-text-subtle">
          Vol enregistré pour le{" "}
          <span className="tabular">{formatDateFR(flight.date)}</span>.
        </p>
      </div>
    </AppShell>
  );
}
