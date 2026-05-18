// FlightSchedule — /admin/carnet-de-route — global flight log + airframe
// maintenance tracker.
//
// Top section (new): maintenance operations.
//   - Two summary tiles (Visite annuelle, Visite atelier) showing the
//     latest event date and the HDV accumulated since that date.
//   - Inline form to log a new operation (type + date + optional notes).
//   - Past-operations table with delete buttons.
//
// Bottom section (unchanged): admin-only single-table view of EVERY
// flight across all pilots. Used for auditing, reporting, and quickly
// finding a row to correct via the per-row edit link.
//
// Columns: DATE | NOM (Pilote) | DEPART | ARRIVEE | BLOCS OFF | BLOCS ON | HDV
//
// Sort toggle via `?order=asc|desc` query param — no client JS, server
// re-renders on the new ordering. Default is descending (newest first).
//
// No pagination in V1. Closed user group of ~5–12 pilots produces a few
// hundred rows per year at most; render all of them and let the browser
// scroll. If volume ever justifies it, drop in cursor pagination on
// `Flight.date + Flight.id`.

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  PencilLine,
  Trash2,
  Wrench,
} from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR } from "@/lib/format";
import { formatHHMM, formatHHMMOrDays } from "@/lib/duration";
import {
  getMaintenanceSummaries,
  MAINTENANCE_TYPE_LABELS,
} from "@/lib/maintenance";
import { resolveBanner } from "@/lib/banners";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  createMaintenanceOperation,
  deleteMaintenanceOperation,
} from "./actions";

function todayParisYmd(): string {
  // Default value for the date input — Paris-local "today" so admins
  // logging an event right after it happened don't have to dial back.
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function CarnetDeRoutePage({
  searchParams,
}: {
  searchParams: Promise<{
    order?: string;
    error?: string;
    maintenance_created?: string;
    maintenance_deleted?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const order: "asc" | "desc" = sp.order === "asc" ? "asc" : "desc";

  const [flights, maintenanceSummaries, maintenanceLog] = await Promise.all([
    prisma.flight.findMany({
      orderBy: [{ date: order }, { engineStart: order }],
      select: {
        id: true,
        date: true,
        depAirport: true,
        arrAirport: true,
        engineStart: true,
        engineStop: true,
        actualDurationMin: true,
        user: { select: { id: true, name: true } },
      },
    }),
    getMaintenanceSummaries(),
    prisma.maintenanceOperation.findMany({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { name: true } } },
    }),
  ]);

  const totalMin = flights.reduce((acc, f) => acc + f.actualDurationMin, 0);
  const otherOrder: "asc" | "desc" = order === "desc" ? "asc" : "desc";

  const banner = resolveBanner(sp, {
    maintenance_created: {
      tone: "success",
      msg: "Opération de maintenance enregistrée.",
    },
    maintenance_deleted: {
      tone: "success",
      msg: "Opération de maintenance supprimée.",
    },
    "error:future_date": {
      tone: "error",
      msg: "La date ne peut pas être dans le futur.",
    },
    "error:invalid": {
      tone: "error",
      msg: "Données invalides. Vérifiez les champs et réessayez.",
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.adminCarnetDeRoute}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {COPY.nav.adminCarnetDeRoute}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-text-muted">
            Suivi de la maintenance avion et journal de tous les vols
            enregistrés, tous pilotes confondus.
          </p>
        </header>

        {banner && (
          <Alert tone={banner.tone} className="mb-6">
            {banner.msg}
          </Alert>
        )}

        {/* ─── Maintenance ─────────────────────────────────────── */}
        <section className="mb-12">
          <div className="mb-4 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-text-subtle" aria-hidden="true" />
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
              Maintenance avion
            </h2>
          </div>

          {/* Summary tiles */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {maintenanceSummaries.map((s) => (
              <Card key={s.type} tone="elevated">
                <p className="text-sm font-medium uppercase tracking-[0.08em] text-text-subtle">
                  {MAINTENANCE_TYPE_LABELS[s.type]}
                </p>
                <p className="mt-3 font-display text-base text-text-muted">
                  Dernière :{" "}
                  <span className="font-semibold tabular text-text-strong">
                    {s.latestDate ? formatDateFR(s.latestDate) : "—"}
                  </span>
                </p>
                <p className="mt-1 font-display text-base text-text-muted">
                  HDV depuis :{" "}
                  <span className="font-semibold tabular text-text-strong">
                    {formatHHMMOrDays(s.hdvSinceMin)}
                  </span>
                  {!s.latestDate && (
                    <span className="ml-2 text-sm text-text-subtle">
                      (total de tous les vols)
                    </span>
                  )}
                </p>
              </Card>
            ))}
          </div>

          {/* Add form */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Enregistrer une opération</CardTitle>
              <CardDescription>
                Notez la date à laquelle la visite a eu lieu (passé ou
                aujourd&apos;hui).
              </CardDescription>
            </CardHeader>
            <form
              action={createMaintenanceOperation}
              className="grid gap-3 sm:grid-cols-4"
            >
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="m-type" required>
                  Type
                </Label>
                <Select id="m-type" name="type" required defaultValue="ANNUAL_VISIT">
                  <option value="ANNUAL_VISIT">
                    {MAINTENANCE_TYPE_LABELS.ANNUAL_VISIT}
                  </option>
                  <option value="WORKSHOP_VISIT">
                    {MAINTENANCE_TYPE_LABELS.WORKSHOP_VISIT}
                  </option>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="m-date" required>
                  Date
                </Label>
                <Input
                  id="m-date"
                  name="date"
                  type="date"
                  required
                  defaultValue={todayParisYmd()}
                  max={todayParisYmd()}
                  className="tabular"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="m-notes">Notes</Label>
                <Input
                  id="m-notes"
                  name="notes"
                  type="text"
                  placeholder="facultatif"
                  maxLength={500}
                />
              </div>
              <div className="sm:col-span-4">
                <Button type="submit">Enregistrer</Button>
              </div>
            </form>
          </Card>

          {/* Log table */}
          {maintenanceLog.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucune opération de maintenance enregistrée pour le moment.
              </p>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-[0.08em] text-text-subtle">
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 pr-4">Type</th>
                    <th className="py-3 pr-4">Notes</th>
                    <th className="py-3 pr-4">Enregistré par</th>
                    <th className="py-3 pl-2" aria-label="Supprimer" />
                  </tr>
                </thead>
                <tbody>
                  {maintenanceLog.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-border-subtle align-top hover:bg-surface-soft/40"
                    >
                      <td className="py-3 pr-4 tabular text-text">
                        {formatDateFR(m.date)}
                      </td>
                      <td className="py-3 pr-4 font-medium text-text-strong">
                        {MAINTENANCE_TYPE_LABELS[m.type]}
                      </td>
                      <td className="py-3 pr-4 text-text-muted">
                        {m.notes ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-text-muted">
                        {m.createdBy.name}
                      </td>
                      <td className="py-3 pl-2 text-right">
                        <ConfirmButton
                          formAction={deleteMaintenanceOperation}
                          hidden={{ id: m.id }}
                          triggerLabel={
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          }
                          triggerIconOnly
                          triggerAriaLabel={`Supprimer l'opération du ${formatDateFR(m.date)}`}
                          title="Supprimer cette opération ?"
                          body={
                            <>
                              L&apos;opération{" "}
                              <span className="font-semibold text-text">
                                {MAINTENANCE_TYPE_LABELS[m.type]}
                              </span>{" "}
                              du{" "}
                              <span className="font-semibold text-text">
                                {formatDateFR(m.date)}
                              </span>{" "}
                              sera supprimée définitivement. Le calcul des
                              HDV depuis la dernière visite sera recalculé.
                            </>
                          }
                          confirmLabel="Supprimer"
                          confirmVariant="danger"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ─── Flight log ─────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList
              className="h-4 w-4 text-text-subtle"
              aria-hidden="true"
            />
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
              Tous les vols
            </h2>
          </div>

          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm text-text-muted">
              <span className="font-semibold tabular text-text">
                {flights.length}
              </span>{" "}
              vol{flights.length !== 1 ? "s" : ""}
              <span className="mx-2 text-text-subtle">·</span>
              total{" "}
              <span className="font-semibold tabular text-text">
                {formatHHMMOrDays(totalMin)}
              </span>
            </p>
            <Link
              href={`/admin/carnet-de-route?order=${otherOrder}`}
              scroll={false}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-muted shadow-xs transition-colors hover:border-border-strong hover:bg-surface-soft hover:text-text"
            >
              {order === "desc" ? (
                <>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  Plus récent d&apos;abord
                </>
              ) : (
                <>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  Plus ancien d&apos;abord
                </>
              )}
            </Link>
          </div>

          {flights.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucun vol enregistré pour le moment.
              </p>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-[0.08em] text-text-subtle">
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 pr-4">Pilote</th>
                    <th className="py-3 pr-4">Départ</th>
                    <th className="py-3 pr-4">Arrivée</th>
                    <th className="py-3 pr-4 text-right">Bloc OFF</th>
                    <th className="py-3 pr-4 text-right">Bloc ON</th>
                    <th className="py-3 pr-4 text-right">HDV</th>
                    <th className="py-3 pl-2" aria-label="Modifier" />
                  </tr>
                </thead>
                <tbody>
                  {flights.map((f) => (
                    <tr
                      key={f.id}
                      className="border-b border-border-subtle align-top hover:bg-surface-soft/40"
                    >
                      <td className="py-3 pr-4 tabular text-text">
                        {formatDateFR(f.date)}
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/admin/pilots/${f.user.id}`}
                          className="font-medium text-text-strong transition-colors hover:text-brand"
                        >
                          {f.user.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 font-display tabular font-semibold text-text-strong">
                        {f.depAirport}
                      </td>
                      <td className="py-3 pr-4 font-display tabular font-semibold text-text-strong">
                        {f.arrAirport}
                      </td>
                      <td className="py-3 pr-4 text-right tabular text-text">
                        {f.engineStart}
                      </td>
                      <td className="py-3 pr-4 text-right tabular text-text">
                        {f.engineStop}
                      </td>
                      <td className="py-3 pr-4 text-right tabular font-semibold text-text">
                        {formatHHMM(f.actualDurationMin)}
                      </td>
                      <td className="py-3 pl-2 text-right">
                        <Link
                          href={`/admin/flights/${f.id}/edit`}
                          aria-label={`Modifier le vol du ${formatDateFR(f.date)}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-brand"
                        >
                          <PencilLine className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
