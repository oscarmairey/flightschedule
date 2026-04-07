// CAVOK — /admin/availability — recurring + per-date availability.

import { CalendarClock, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { DAY_LABELS_FR, formatDateFR } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import {
  createRecurringBlock,
  createOverrideBlock,
  deleteAvailabilityBlock,
} from "./actions";

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    deleted?: string;
    count?: string;
    date?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const [recurring, overrides] = await Promise.all([
    prisma.availabilityBlock.findMany({
      where: { dayOfWeek: { not: null } },
      orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }],
    }),
    prisma.availabilityBlock.findMany({
      where: { specificDate: { not: null } },
      orderBy: [{ specificDate: "asc" }, { startMinutes: "asc" }],
    }),
  ]);

  const banner =
    params.error === "conflicts"
      ? {
          tone: "error" as const,
          msg: `${params.count ?? "?"} réservation(s) confirmée(s) en conflit${
            params.date ? ` le ${params.date}` : ""
          }. Annulez-les d'abord.`,
        }
      : params.error === "bad_range"
        ? { tone: "error" as const, msg: "Plage horaire invalide." }
        : params.error === "invalid"
          ? { tone: "error" as const, msg: COPY.errors.invalidInput }
          : params.created === "1"
            ? { tone: "success" as const, msg: "Disponibilité créée." }
            : params.deleted === "1"
              ? { tone: "success" as const, msg: "Disponibilité supprimée." }
              : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.adminAvailability}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Disponibilités du F-GBQA
          </h1>
          <p className="mt-3 max-w-xl text-base text-text-muted">
            Définit les fenêtres où le Cessna est réservable. Les exceptions
            ponctuelles l&apos;emportent toujours sur les blocs récurrents.
          </p>
        </header>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        {/* Create recurring */}
        <Card className="mb-10">
          <CardHeader>
            <CardTitle>Disponibilité récurrente</CardTitle>
            <CardDescription>
              Hebdomadaire — par exemple « Lundi 08:00–18:00 ». Les exceptions
              ci-dessous prennent toujours la priorité.
            </CardDescription>
          </CardHeader>
          <form
            action={createRecurringBlock}
            className="grid gap-3 sm:grid-cols-5"
          >
            <div className="space-y-1.5">
              <Label htmlFor="dayOfWeek" required>
                Jour
              </Label>
              <select
                id="dayOfWeek"
                name="dayOfWeek"
                required
                className="block w-full min-h-11 rounded-md border border-border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs focus:border-brand focus:outline-none"
              >
                {DAY_LABELS_FR.map((label, idx) => (
                  <option key={idx} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-start" required>
                Début
              </Label>
              <Input
                id="rec-start"
                name="startStr"
                type="time"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-end" required>
                Fin
              </Label>
              <Input
                id="rec-end"
                name="endStr"
                type="time"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-type" required>
                Type
              </Label>
              <select
                id="rec-type"
                name="type"
                required
                className="block w-full min-h-11 rounded-md border border-border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs focus:border-brand focus:outline-none"
              >
                <option value="AVAILABLE">Disponible</option>
                <option value="UNAVAILABLE">Indisponible</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-reason">Motif</Label>
              <Input
                id="rec-reason"
                name="reason"
                type="text"
                placeholder="facultatif"
                maxLength={500}
              />
            </div>
            <div className="sm:col-span-5">
              <Button type="submit">Ajouter</Button>
            </div>
          </form>

          {recurring.length === 0 ? (
            <p className="mt-6 text-sm text-text-muted">
              Aucune disponibilité récurrente définie.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border-subtle border-t border-border-subtle">
              {recurring.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-text-strong">
                      {DAY_LABELS_FR[b.dayOfWeek ?? 0]}
                      <span className="mx-2 text-text-subtle">·</span>
                      <span className="tabular text-text-muted">
                        {fmtMinutes(b.startMinutes)} – {fmtMinutes(b.endMinutes)}
                      </span>
                    </p>
                    {b.reason && (
                      <p className="mt-0.5 text-xs text-text-subtle">
                        {b.reason}
                      </p>
                    )}
                  </div>
                  {b.type === "AVAILABLE" ? (
                    <Badge variant="success" size="sm">
                      Disponible
                    </Badge>
                  ) : (
                    <Badge variant="danger" size="sm">
                      Indisponible
                    </Badge>
                  )}
                  <form action={deleteAvailabilityBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <button
                      type="submit"
                      aria-label="Supprimer cette disponibilité"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Per-date overrides */}
        <Card>
          <CardHeader>
            <CardTitle>Exceptions ponctuelles</CardTitle>
            <CardDescription>
              Une exception pour une date donnée remplace TOUS les blocs
              récurrents de ce jour.
            </CardDescription>
          </CardHeader>
          <form
            action={createOverrideBlock}
            className="grid gap-3 sm:grid-cols-5"
          >
            <div className="space-y-1.5">
              <Label htmlFor="ov-date" required>
                Date
              </Label>
              <Input
                id="ov-date"
                name="date"
                type="date"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-start" required>
                Début
              </Label>
              <Input
                id="ov-start"
                name="startStr"
                type="time"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-end" required>
                Fin
              </Label>
              <Input
                id="ov-end"
                name="endStr"
                type="time"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-type" required>
                Type
              </Label>
              <select
                id="ov-type"
                name="type"
                required
                className="block w-full min-h-11 rounded-md border border-border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs focus:border-brand focus:outline-none"
              >
                <option value="AVAILABLE">Disponible</option>
                <option value="UNAVAILABLE">Indisponible</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-reason">Motif</Label>
              <Input
                id="ov-reason"
                name="reason"
                type="text"
                placeholder="facultatif"
                maxLength={500}
              />
            </div>
            <div className="sm:col-span-5">
              <Button type="submit">Ajouter une exception</Button>
            </div>
          </form>

          {overrides.length === 0 ? (
            <p className="mt-6 text-sm text-text-muted">
              Aucune exception définie.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border-subtle border-t border-border-subtle">
              {overrides.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-text-strong">
                      {formatDateFR(b.specificDate)}
                      <span className="mx-2 text-text-subtle">·</span>
                      <span className="tabular text-text-muted">
                        {fmtMinutes(b.startMinutes)} – {fmtMinutes(b.endMinutes)}
                      </span>
                    </p>
                    {b.reason && (
                      <p className="mt-0.5 text-xs text-text-subtle">
                        {b.reason}
                      </p>
                    )}
                  </div>
                  {b.type === "AVAILABLE" ? (
                    <Badge variant="success" size="sm">
                      Disponible
                    </Badge>
                  ) : (
                    <Badge variant="danger" size="sm">
                      Indisponible
                    </Badge>
                  )}
                  <form action={deleteAvailabilityBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <button
                      type="submit"
                      aria-label="Supprimer cette exception"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
