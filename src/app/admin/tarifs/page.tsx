// FlightSchedule — /admin/tarifs — Stripe Package CRUD. V2.
//
// Lists active and archived packages with create/edit/archive forms.
// Every mutation syncs to the Stripe Product/Price API in the same
// server action call.

import { Tag, Plus, Trash2, RotateCcw } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatHHMM } from "@/lib/duration";
import { formatDateTimeFR } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { AppShell } from "@/components/AppShell";
import { resolveBanner } from "@/lib/banners";
import {
  createPackage,
  updatePackage,
  archivePackage,
  unarchivePackage,
  upsertBankAccount,
  createFlightHourType,
  updateFlightHourType,
  archiveFlightHourType,
  unarchiveFlightHourType,
} from "./actions";

function formatEUR(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

type TarifsSection = "forfaits" | "types" | "banque";

export default async function AdminTarifsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    msg?: string;
    created?: string;
    updated?: string;
    archived?: string;
    unarchived?: string;
    bank?: string;
    section?: string;
    type_created?: string;
    type_updated?: string;
    type_archived?: string;
    type_unarchived?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const isTypeSection =
    sp.section === "types" ||
    sp.type_created === "1" ||
    sp.type_updated === "1" ||
    sp.type_archived === "1" ||
    sp.type_unarchived === "1" ||
    sp.error === "invalid_type" ||
    sp.error === "duplicate_type" ||
    sp.error === "type_has_packages";

  // URL-driven tab state. `bank=1` (set by the upsertBankAccount server
  // action on success) auto-jumps to the Banque tab so the admin lands
  // on the confirmation. Otherwise respect `?section=…` or default.
  const section: TarifsSection = isTypeSection
    ? "types"
    : sp.section === "banque" || sp.bank === "1" || sp.error === "invalid_bank"
      ? "banque"
      : "forfaits";

  const [active, archived, bankAccount, allTypes] = await Promise.all([
    prisma.package.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        flightHourType: { select: { id: true, name: true } },
      },
    }),
    prisma.package.findMany({
      where: { isActive: false },
      orderBy: { updatedAt: "desc" },
      include: {
        flightHourType: { select: { id: true, name: true } },
      },
    }),
    prisma.bankAccount.findFirst({
      orderBy: { updatedAt: "desc" },
    }),
    prisma.flightHourType.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
  ]);
  const activeTypes = allTypes.filter((t) => t.isActive);
  const archivedTypes = allTypes.filter((t) => !t.isActive);

  const banner = resolveBanner(sp, {
    created: { tone: "success", msg: "Forfait créé." },
    updated: { tone: "success", msg: "Forfait mis à jour." },
    archived: { tone: "success", msg: "Forfait archivé." },
    unarchived: { tone: "success", msg: "Forfait réactivé." },
    bank: { tone: "success", msg: "Coordonnées bancaires enregistrées." },
    type_created: { tone: "success", msg: "Type d'heures créé." },
    type_updated: { tone: "success", msg: "Type d'heures mis à jour." },
    type_archived: { tone: "success", msg: "Type d'heures archivé." },
    type_unarchived: { tone: "success", msg: "Type d'heures réactivé." },
    "error:invalid_bank": {
      tone: "error",
      msg: "Coordonnées bancaires invalides (IBAN / BIC).",
    },
    "error:stripe": {
      tone: "error",
      msg: (sp) => `Erreur Stripe : ${sp.msg ?? "détails indisponibles"}`,
    },
    "error:invalid_type": {
      tone: "error",
      msg: "Type d'heures invalide ou inactif.",
    },
    "error:duplicate_type": {
      tone: "error",
      msg: "Un type d'heures porte déjà ce nom.",
    },
    "error:type_has_packages": {
      tone: "error",
      msg:
        "Impossible d'archiver : ce type est encore utilisé par un ou plusieurs forfaits actifs. Archivez ces forfaits d'abord.",
    },
    "error:invalid": { tone: "error", msg: COPY.errors.invalidInput },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <Tag className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.adminTarifs}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Tarifs
          </h1>
          <p className="mt-3 max-w-xl text-base text-text-muted">
            Forfaits HDV et coordonnées bancaires. Les forfaits sont
            synchronisés avec Stripe — chaque modification crée un nouveau
            tarif (les prix Stripe sont immuables). Les forfaits archivés
            restent dans l&apos;historique des achats.
          </p>
        </header>

        {/* Tab switcher — URL-driven, no client JS. */}
        <nav
          aria-label="Sections des tarifs"
          className="mb-8 flex gap-1 border-b border-border-subtle"
        >
          <TabLink
            href="/admin/tarifs?section=forfaits"
            active={section === "forfaits"}
          >
            Forfaits ({active.length})
          </TabLink>
          <TabLink
            href="/admin/tarifs?section=types"
            active={section === "types"}
          >
            Types d&apos;heures ({activeTypes.length})
          </TabLink>
          <TabLink
            href="/admin/tarifs?section=banque"
            active={section === "banque"}
          >
            Coordonnées bancaires
          </TabLink>
        </nav>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        {section === "forfaits" && (
          <>
        {activeTypes.length === 0 && (
          <div className="mb-6">
            <Alert tone="info">
              Aucun type d&apos;heures actif. Créez d&apos;abord un type dans
              l&apos;onglet{" "}
              <a
                href="/admin/tarifs?section=types"
                className="font-medium underline"
              >
                Types d&apos;heures
              </a>{" "}
              avant de pouvoir créer un forfait.
            </Alert>
          </div>
        )}
        {/* Create form */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle>Nouveau forfait</CardTitle>
            <CardDescription>
              Le prix est en EUR (HT). Stripe Tax appliquera la TVA française
              à 20 % au paiement.
            </CardDescription>
          </CardHeader>
          <form action={createPackage} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="new-name" required>
                Nom
              </Label>
              <Input
                id="new-name"
                name="name"
                type="text"
                required
                maxLength={120}
                placeholder="Ex : Standard"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="new-flightHourTypeId" required>
                Type d&apos;heures
              </Label>
              <Select
                id="new-flightHourTypeId"
                name="flightHourTypeId"
                required
                disabled={activeTypes.length === 0}
                defaultValue=""
                className="disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="" disabled>
                  {activeTypes.length === 0
                    ? "Aucun type disponible"
                    : "Choisir un type…"}
                </option>
                {activeTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="new-description">Description</Label>
              <Input
                id="new-description"
                name="description"
                type="text"
                maxLength={500}
                placeholder="facultatif"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-priceEUR" required>
                Prix HT (€)
              </Label>
              <Input
                id="new-priceEUR"
                name="priceEUR"
                type="number"
                required
                min={0}
                step="0.01"
                inputMode="decimal"
                className="tabular"
                placeholder="900"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-hdvMinutes" required>
                HDV (HH:MM)
              </Label>
              <Input
                id="new-hdvMinutes"
                name="hdvMinutes"
                type="text"
                required
                inputMode="numeric"
                className="tabular"
                placeholder="10h00"
              />
              <p className="text-xs text-text-subtle">
                Formats acceptés : <span className="tabular">10h00</span>,{" "}
                <span className="tabular">10:00</span> ou{" "}
                <span className="tabular">600</span> (minutes).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-sortOrder">Ordre d&apos;affichage</Label>
              <Input
                id="new-sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={0}
                inputMode="numeric"
                className="tabular"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Créer le forfait
              </Button>
            </div>
          </form>
        </Card>

        {/* Active packages */}
        <section className="mb-12">
          <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
            Forfaits actifs ({active.length})
          </h2>
          {active.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucun forfait actif. Créez-en un ci-dessus.
              </p>
            </Card>
          ) : (
            <ul className="space-y-4">
              {active.map((pkg) => (
                <li key={pkg.id}>
                  <Card>
                    <form action={updatePackage} className="grid gap-4 sm:grid-cols-2">
                      <input type="hidden" name="id" value={pkg.id} />
                      <div className="sm:col-span-2 flex flex-wrap items-baseline justify-between gap-3">
                        <div>
                          <h3 className="font-display text-lg font-semibold text-text-strong">
                            {pkg.name}
                          </h3>
                          <p className="text-xs text-text-subtle">
                            {formatEUR(pkg.priceCentsHT)} HT ·{" "}
                            {formatHHMM(pkg.hdvMinutes)} ·{" "}
                            {pkg.flightHourType.name}
                          </p>
                        </div>
                        <Badge variant="success" size="sm">
                          Actif
                        </Badge>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor={`type-${pkg.id}`} required>
                          Type d&apos;heures
                        </Label>
                        <Select
                          id={`type-${pkg.id}`}
                          name="flightHourTypeId"
                          required
                          defaultValue={pkg.flightHourTypeId}
                        >
                          {/* Always include current type (even if archived) so the form isn't broken. */}
                          {!activeTypes.find(
                            (t) => t.id === pkg.flightHourTypeId,
                          ) && (
                            <option value={pkg.flightHourTypeId}>
                              {pkg.flightHourType.name} (archivé)
                            </option>
                          )}
                          {activeTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor={`name-${pkg.id}`} required>
                          Nom
                        </Label>
                        <Input
                          id={`name-${pkg.id}`}
                          name="name"
                          type="text"
                          required
                          maxLength={120}
                          defaultValue={pkg.name}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor={`desc-${pkg.id}`}>Description</Label>
                        <Input
                          id={`desc-${pkg.id}`}
                          name="description"
                          type="text"
                          maxLength={500}
                          defaultValue={pkg.description ?? ""}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`price-${pkg.id}`} required>
                          Prix HT (€)
                        </Label>
                        <Input
                          id={`price-${pkg.id}`}
                          name="priceEUR"
                          type="number"
                          required
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          className="tabular"
                          defaultValue={(pkg.priceCentsHT / 100).toString()}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`hdv-${pkg.id}`} required>
                          HDV (HH:MM)
                        </Label>
                        <Input
                          id={`hdv-${pkg.id}`}
                          name="hdvMinutes"
                          type="text"
                          required
                          inputMode="numeric"
                          className="tabular"
                          defaultValue={formatHHMM(pkg.hdvMinutes)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`sort-${pkg.id}`}>
                          Ordre d&apos;affichage
                        </Label>
                        <Input
                          id={`sort-${pkg.id}`}
                          name="sortOrder"
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="tabular"
                          defaultValue={pkg.sortOrder}
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-wrap gap-2">
                        <Button type="submit">Enregistrer</Button>
                      </div>
                    </form>
                    <div className="mt-4 border-t border-border-subtle pt-4">
                      <ConfirmButton
                        formAction={archivePackage}
                        hidden={{ id: pkg.id }}
                        triggerLabel={
                          <>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Archiver ce forfait
                          </>
                        }
                        triggerVariant="ghost"
                        triggerSize="sm"
                        title="Archiver ce forfait ?"
                        body={
                          <>
                            <span className="font-semibold text-text">
                              {pkg.name}
                            </span>{" "}
                            ne sera plus proposé aux pilotes. Les achats
                            passés restent dans l&apos;historique. Vous
                            pourrez le réactiver depuis la section
                            « Forfaits archivés ».
                          </>
                        }
                        confirmLabel="Archiver"
                        confirmVariant="danger"
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Archived packages */}
        {archived.length > 0 && (
          <section>
            <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
              Forfaits archivés ({archived.length})
            </h2>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {archived.map((pkg) => (
                <li
                  key={pkg.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 opacity-70"
                >
                  <div>
                    <p className="font-display text-base font-semibold text-text-strong">
                      {pkg.name}
                    </p>
                    <p className="text-xs tabular text-text-subtle">
                      {formatEUR(pkg.priceCentsHT)} HT ·{" "}
                      {formatHHMM(pkg.hdvMinutes)} · {pkg.flightHourType.name}
                    </p>
                  </div>
                  <form action={unarchivePackage}>
                    <input type="hidden" name="id" value={pkg.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      Réactiver
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

          </>
        )}

        {section === "types" && (
          <>
            <Card className="mb-12">
              <CardHeader>
                <CardTitle>Nouveau type d&apos;heures</CardTitle>
                <CardDescription>
                  Chaque forfait doit être rattaché à un type (ex : École,
                  Voyage, Local). Un pilote ne peut détenir des heures que
                  d&apos;un seul type à la fois.
                </CardDescription>
              </CardHeader>
              <form
                action={createFlightHourType}
                className="grid gap-4 sm:grid-cols-2"
              >
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="new-type-name" required>
                    Nom
                  </Label>
                  <Input
                    id="new-type-name"
                    name="name"
                    type="text"
                    required
                    maxLength={60}
                    placeholder="Ex : École"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="new-type-description">Description</Label>
                  <Input
                    id="new-type-description"
                    name="description"
                    type="text"
                    maxLength={500}
                    placeholder="facultatif"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Créer le type
                  </Button>
                </div>
              </form>
            </Card>

            <section className="mb-12">
              <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
                Types actifs ({activeTypes.length})
              </h2>
              {activeTypes.length === 0 ? (
                <Card tone="sunken">
                  <p className="text-sm text-text-muted">
                    Aucun type d&apos;heures. Créez-en un ci-dessus pour
                    pouvoir créer des forfaits.
                  </p>
                </Card>
              ) : (
                <ul className="space-y-4">
                  {activeTypes.map((t) => (
                    <li key={t.id}>
                      <Card>
                        <form
                          action={updateFlightHourType}
                          className="grid gap-4 sm:grid-cols-2"
                        >
                          <input type="hidden" name="id" value={t.id} />
                          <div className="sm:col-span-2 flex flex-wrap items-baseline justify-between gap-3">
                            <div>
                              <h3 className="font-display text-lg font-semibold text-text-strong">
                                {t.name}
                              </h3>
                            </div>
                            <Badge variant="success" size="sm">
                              Actif
                            </Badge>
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor={`type-name-${t.id}`} required>
                              Nom
                            </Label>
                            <Input
                              id={`type-name-${t.id}`}
                              name="name"
                              type="text"
                              required
                              maxLength={60}
                              defaultValue={t.name}
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor={`type-desc-${t.id}`}>
                              Description
                            </Label>
                            <Input
                              id={`type-desc-${t.id}`}
                              name="description"
                              type="text"
                              maxLength={500}
                              defaultValue={t.description ?? ""}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Button type="submit">Enregistrer</Button>
                          </div>
                        </form>
                        <div className="mt-4 border-t border-border-subtle pt-4">
                          <ConfirmButton
                            formAction={archiveFlightHourType}
                            hidden={{ id: t.id }}
                            triggerLabel={
                              <>
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                Archiver ce type
                              </>
                            }
                            triggerVariant="ghost"
                            triggerSize="sm"
                            title="Archiver ce type d'heures ?"
                            body={
                              <>
                                <span className="font-semibold text-text">
                                  {t.name}
                                </span>{" "}
                                ne sera plus proposé à la création d&apos;un
                                forfait. Les forfaits et transactions
                                historiques qui y sont rattachés restent
                                intacts.
                              </>
                            }
                            confirmLabel="Archiver"
                            confirmVariant="danger"
                          />
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {archivedTypes.length > 0 && (
              <section>
                <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
                  Types archivés ({archivedTypes.length})
                </h2>
                <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                  {archivedTypes.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4 opacity-70"
                    >
                      <div>
                        <p className="font-display text-base font-semibold text-text-strong">
                          {t.name}
                        </p>
                      </div>
                      <form action={unarchiveFlightHourType}>
                        <input type="hidden" name="id" value={t.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          Réactiver
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {section === "banque" && (
        /* Bank account (single row) — shown whether configured or not. */
        <section>
          <h2 className="font-display mb-2 text-2xl font-semibold tracking-tight text-text-strong">
            Coordonnées bancaires
          </h2>
          <p className="mb-4 max-w-xl text-sm text-text-muted">
            Affichées aux pilotes dans l&apos;onglet « Virement bancaire » du
            modal de paiement. Chaque virement reçu doit être validé
            depuis <span className="font-medium text-text">Virements</span>.
          </p>
          <Card>
            <form action={upsertBankAccount} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bank-holderName" required>
                  Titulaire
                </Label>
                <Input
                  id="bank-holderName"
                  name="holderName"
                  type="text"
                  required
                  maxLength={200}
                  defaultValue={bankAccount?.holderName ?? ""}
                  placeholder="Association de pilotage"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bank-iban" required>
                  IBAN
                </Label>
                <Input
                  id="bank-iban"
                  name="iban"
                  type="text"
                  required
                  className="tabular"
                  defaultValue={bankAccount?.iban ?? ""}
                  placeholder="FR76 1234 5678 9012 3456 7890 185"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-bic" required>
                  BIC
                </Label>
                <Input
                  id="bank-bic"
                  name="bic"
                  type="text"
                  required
                  className="tabular"
                  defaultValue={bankAccount?.bic ?? ""}
                  placeholder="BNPAFRPP"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-bankName">Banque</Label>
                <Input
                  id="bank-bankName"
                  name="bankName"
                  type="text"
                  maxLength={200}
                  defaultValue={bankAccount?.bankName ?? ""}
                  placeholder="facultatif"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bank-instructions">
                  Instructions complémentaires
                </Label>
                <Input
                  id="bank-instructions"
                  name="instructions"
                  type="text"
                  maxLength={1000}
                  defaultValue={bankAccount?.instructions ?? ""}
                  placeholder="facultatif — ex : « Merci d'inclure votre nom dans le libellé »"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">
                  {bankAccount ? "Mettre à jour" : "Enregistrer"}
                </Button>
                {bankAccount && (
                  <p className="mt-2 text-xs tabular text-text-subtle">
                    Dernière modification : {formatDateTimeFR(bankAccount.updatedAt)}
                  </p>
                )}
              </div>
            </form>
          </Card>
        </section>
        )}
      </div>
    </AppShell>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-brand text-brand"
          : "border-transparent text-text-muted hover:border-border hover:text-text-strong"
      }`}
    >
      {children}
    </a>
  );
}
