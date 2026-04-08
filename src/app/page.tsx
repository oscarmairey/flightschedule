// FlightSchedule — public landing page at /
//
// V2 behavior: authenticated users still skip straight to /dashboard
// (or /setup-password if mustResetPw). Visitors who land on
// flightschedule.org without a session see the marketing/info page below.
// The only CTA is /login because the user group is closed — accounts
// are created by the club administrator, not via self-registration.

import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  PencilLine,
  Wallet,
  Smartphone,
  Camera,
  ShieldCheck,
  ArrowRight,
  Check,
  X,
} from "lucide-react";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.mustResetPw ? "/setup-password" : "/dashboard");
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-surface">
      {/* Brand-tinted aura — same trick as the login page for cohesion */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[760px] overflow-hidden"
      >
        <div className="absolute -top-44 -right-40 h-[560px] w-[560px] rounded-full bg-brand-soft opacity-70 blur-3xl" />
        <div className="absolute -top-32 -left-32 h-[440px] w-[440px] rounded-full bg-warning-soft opacity-50 blur-3xl" />
      </div>

      {/* Sticky minimal header */}
      <header className="relative z-10 border-b border-border-subtle/60 bg-surface/70 backdrop-blur supports-[backdrop-filter]:bg-surface/50">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4 lg:px-12">
          <Link
            href="/"
            className="group flex items-center gap-2.5"
            aria-label="FlightSchedule"
          >
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-md ring-1 ring-border-subtle"
              priority
            />
            <span className="font-display text-xl font-semibold tracking-tight text-text-strong transition-colors group-hover:text-brand">
              FlightSchedule
            </span>
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-text shadow-xs transition-colors hover:border-border-strong hover:bg-surface-soft"
          >
            Se connecter
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:px-12 lg:pt-32 lg:pb-32">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-brand">
            L&apos;app de planning aéro
          </p>
          <h1 className="font-display mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-text-strong sm:text-6xl lg:text-7xl">
            Le planning de votre avion,{" "}
            <span className="text-brand">simplement</span>.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-text-muted sm:text-xl">
            Réservations, heures de vol et carnet de bord — un seul outil,
            partout, depuis votre poche.
          </p>

          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-6 py-3 text-base font-medium text-text-on-brand shadow-[var(--shadow-brand)] transition-all hover:bg-brand-hover hover:shadow-md"
            >
              Se connecter
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <p className="text-sm text-text-subtle">
              Accès réservé aux pilotes autorisés.
            </p>
          </div>
        </div>
      </section>

      {/* Avant / Avec — the problem-solution strip */}
      <section className="relative border-y border-border-subtle bg-surface-soft">
        <div className="mx-auto grid w-full max-w-6xl gap-px bg-border-subtle sm:grid-cols-2">
          <div className="bg-surface-soft px-6 py-12 lg:px-12 lg:py-14">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
              Avant
            </p>
            <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-text-strong">
              Un puzzle de quatre outils
            </h2>
            <ul className="mt-6 space-y-3 text-sm text-text-muted">
              {[
                "Un Google Sheet de réservations mis à jour deux fois par an",
                "Un groupe WhatsApp pour s'échanger les créneaux",
                "Le carnet de bord papier photographié et envoyé à l'admin",
                "Un fichier Excel de comptes ressaisi à la main",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <X
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-subtle"
                    aria-hidden="true"
                    strokeWidth={2}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface-elevated px-6 py-12 lg:px-12 lg:py-14">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand">
              Avec FlightSchedule
            </p>
            <h2 className="font-display mt-3 text-2xl font-semibold tracking-tight text-text-strong">
              Un seul outil, à jour en temps réel
            </h2>
            <ul className="mt-6 space-y-3 text-sm text-text-muted">
              {[
                "Le calendrier de l'avion, partagé et anti-collision",
                "La saisie des vols depuis le téléphone, photos comprises",
                "Le solde HDV de chaque pilote, visible et rechargeable",
                "Le tableau de bord admin, sans aucune ressaisie",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-success"
                    aria-hidden="true"
                    strokeWidth={2.25}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative">
        <div className="mx-auto w-full max-w-6xl px-6 py-20 lg:px-12 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
              Fonctionnalités
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              Tout ce qu&apos;il faut, rien de superflu
            </h2>
            <p className="mt-4 text-base leading-relaxed text-text-muted">
              FlightSchedule remplace le patchwork d&apos;outils par une
              application unique, pensée pour le terrain et pour les petits
              groupes de pilotes.
            </p>
          </div>

          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              Icon={CalendarDays}
              title="Calendrier en temps réel"
              body="Réservez un créneau en quelques tapes. Détection automatique des conflits, fenêtres d'indisponibilité gérées par l'admin."
            />
            <Feature
              Icon={PencilLine}
              title="Saisie de vol mobile"
              body="Heures bloc OFF / ON, aéroports, atterrissages, remarques. La durée est calculée et débitée automatiquement."
            />
            <Feature
              Icon={Camera}
              title="Photos du carnet de bord"
              body="Jusqu'à 5 photos par vol, uploadées en direct vers un stockage privé chiffré. Plus besoin d'envoyer des clichés sur WhatsApp."
            />
            <Feature
              Icon={Wallet}
              title="Solde HDV en direct"
              body="Chaque pilote suit son compteur d'heures. Recharge instantanée par carte bancaire via Stripe, justificatif inclus."
            />
            <Feature
              Icon={Smartphone}
              title="Pensé mobile, installable"
              body="Optimisé pour les écrans de téléphone et l'usage sur le terrain. Installable comme une app native (PWA)."
            />
            <Feature
              Icon={ShieldCheck}
              title="Sécurisé et auditable"
              body="HTTPS de bout en bout, photos privées, traçabilité complète : chaque mouvement de solde est lié à une transaction signée."
            />
          </ul>
        </div>
      </section>

      {/* Pour qui */}
      <section className="relative border-t border-border-subtle bg-surface-sunken">
        <div className="mx-auto w-full max-w-4xl px-6 py-20 text-center lg:px-12 lg:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
            Pour qui
          </p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
            Les petits groupes qui partagent un avion
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-muted sm:text-lg">
            FlightSchedule est conçu pour 5 à 12 pilotes privés et 1 à 2
            administrateurs autour d&apos;un seul appareil. Pas de
            multi-machine, pas de bureaucratie inutile&nbsp;: juste
            l&apos;essentiel, bien fait.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative">
        <div className="mx-auto w-full max-w-6xl px-6 py-20 lg:px-12 lg:py-28">
          <div className="relative overflow-hidden rounded-2xl border border-brand-soft-border bg-brand-soft px-8 py-14 text-center sm:px-16 sm:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/10 blur-3xl"
            />
            <div className="relative">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
                Prêt à décoller&nbsp;?
              </h2>
              <p className="mt-4 text-base text-brand-soft-fg/90 sm:text-lg">
                Connectez-vous avec les identifiants fournis par
                l&apos;administrateur de votre aéroclub.
              </p>
              <div className="mt-8 flex justify-center">
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-7 py-3 text-base font-medium text-text-on-brand shadow-[var(--shadow-brand)] transition-all hover:bg-brand-hover hover:shadow-md"
                >
                  Se connecter
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              </div>
              <p className="mt-6 text-xs text-text-subtle">
                Pas encore de compte&nbsp;? Contactez l&apos;administrateur de
                votre aéroclub.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-border-subtle">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 px-6 py-8 text-xs text-text-subtle sm:flex-row sm:items-center sm:justify-between lg:px-12">
          <p className="font-display text-sm font-semibold tracking-tight text-text-strong">
            FlightSchedule
          </p>
          <p>Moins de temps dans les tableurs, plus de temps en l&apos;air.</p>
        </div>
      </footer>
    </main>
  );
}

function Feature({
  Icon,
  title,
  body,
}: {
  Icon: typeof CalendarDays;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-xl border border-border-subtle bg-surface-elevated p-6 shadow-xs transition-shadow hover:shadow-sm">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg ring-1 ring-brand-soft-border">
        <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
      </div>
      <h3 className="font-display mt-5 text-lg font-semibold tracking-tight text-text-strong">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{body}</p>
    </li>
  );
}
