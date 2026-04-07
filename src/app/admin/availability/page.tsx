// CAVOK — /admin/availability — recurring + per-date availability.

import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { DAY_LABELS_FR, formatDateFR } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
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
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.adminAvailability}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Définit les fenêtres où le Cessna F-GBQA est réservable.
          </p>
        </header>

        {banner && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              banner.tone === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-red-300 bg-red-50 text-red-900"
            }`}
            role="alert"
          >
            {banner.msg}
          </div>
        )}

        {/* Create recurring */}
        <Card>
          <CardHeader>
            <CardTitle>Disponibilité récurrente</CardTitle>
            <CardDescription>
              Hebdomadaire — par exemple « Lundi 08:00–18:00 ». Les exceptions ci-dessous
              prennent toujours la priorité sur ces blocs.
            </CardDescription>
          </CardHeader>
          <form action={createRecurringBlock} className="grid gap-3 sm:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="dayOfWeek" required>Jour</Label>
              <select
                id="dayOfWeek"
                name="dayOfWeek"
                required
                className="block w-full min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {DAY_LABELS_FR.map((label, idx) => (
                  <option key={idx} value={idx}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-start" required>Début</Label>
              <Input id="rec-start" name="startStr" type="time" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-end" required>Fin</Label>
              <Input id="rec-end" name="endStr" type="time" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-type" required>Type</Label>
              <select
                id="rec-type"
                name="type"
                required
                className="block w-full min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="AVAILABLE">Disponible</option>
                <option value="UNAVAILABLE">Indisponible</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-reason">Motif</Label>
              <Input id="rec-reason" name="reason" type="text" placeholder="facultatif" maxLength={500} />
            </div>
            <div className="sm:col-span-5">
              <Button type="submit">Ajouter</Button>
            </div>
          </form>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Jour</th>
                  <th className="px-3 py-2">Plage</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Motif</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {recurring.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-medium">{DAY_LABELS_FR[b.dayOfWeek ?? 0]}</td>
                    <td className="px-3 py-2 text-zinc-700">
                      {fmtMinutes(b.startMinutes)} – {fmtMinutes(b.endMinutes)}
                    </td>
                    <td className="px-3 py-2">
                      {b.type === "AVAILABLE" ? (
                        <Badge variant="success">Disponible</Badge>
                      ) : (
                        <Badge variant="danger">Indisponible</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{b.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteAvailabilityBlock}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="text-sm font-medium text-red-700 hover:underline"
                        >
                          Supprimer
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {recurring.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-500">
                      Aucune disponibilité récurrente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Per-date overrides */}
        <Card>
          <CardHeader>
            <CardTitle>Exceptions ponctuelles</CardTitle>
            <CardDescription>
              Une exception pour une date donnée remplace TOUS les blocs récurrents
              de ce jour.
            </CardDescription>
          </CardHeader>
          <form action={createOverrideBlock} className="grid gap-3 sm:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="ov-date" required>Date</Label>
              <Input id="ov-date" name="date" type="date" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-start" required>Début</Label>
              <Input id="ov-start" name="startStr" type="time" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-end" required>Fin</Label>
              <Input id="ov-end" name="endStr" type="time" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-type" required>Type</Label>
              <select
                id="ov-type"
                name="type"
                required
                className="block w-full min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="AVAILABLE">Disponible</option>
                <option value="UNAVAILABLE">Indisponible</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-reason">Motif</Label>
              <Input id="ov-reason" name="reason" type="text" placeholder="facultatif" maxLength={500} />
            </div>
            <div className="sm:col-span-5">
              <Button type="submit">Ajouter une exception</Button>
            </div>
          </form>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Plage</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Motif</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {overrides.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-medium">{formatDateFR(b.specificDate)}</td>
                    <td className="px-3 py-2 text-zinc-700">
                      {fmtMinutes(b.startMinutes)} – {fmtMinutes(b.endMinutes)}
                    </td>
                    <td className="px-3 py-2">
                      {b.type === "AVAILABLE" ? (
                        <Badge variant="success">Disponible</Badge>
                      ) : (
                        <Badge variant="danger">Indisponible</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{b.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteAvailabilityBlock}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="text-sm font-medium text-red-700 hover:underline"
                        >
                          Supprimer
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {overrides.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-500">
                      Aucune exception définie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
