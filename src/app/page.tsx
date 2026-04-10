// FlightSchedule — public landing page at /
//
// Authenticated users skip to /dashboard (or /setup-password if mustResetPw).
// Visitors see the product page below.

import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { PreviewDashboard } from "@/components/landing/PreviewDashboard";
import { PreviewCalendar } from "@/components/landing/PreviewCalendar";
import { PreviewFlight } from "@/components/landing/PreviewFlight";
import { PreviewPurchase } from "@/components/landing/PreviewPurchase";

const GITHUB_URL = "https://github.com/oscarmairey/flightschedule";


export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.mustResetPw ? "/setup-password" : "/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-border-subtle/60 bg-surface/70 backdrop-blur supports-[backdrop-filter]:bg-surface/50">
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
          <div className="flex items-center gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 text-base text-text-muted transition-colors hover:text-brand sm:inline-flex"
            >
              Code source
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-4 py-2 text-base font-medium text-text shadow-xs transition-colors hover:border-border-strong hover:bg-surface-soft"
            >
              Se connecter
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero + Dashboard preview ───────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Atmospheric sky wash — single radial, not splotchy */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 75% 20%, oklch(0.94 0.035 232 / 0.40), transparent 70%)",
          }}
        />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pt-20 pb-14 sm:pt-28 sm:pb-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-12 lg:pt-36 lg:pb-20">
          {/* Text column */}
          <div className="hero-enter">
            <p className="text-base font-semibold uppercase tracking-[0.15em] text-brand">
              Open source · Conçu par des pilotes
            </p>
            <h1 className="mt-5 font-display text-[2.75rem] font-bold leading-[0.95] tracking-[-0.035em] text-text-strong sm:text-6xl lg:text-[4rem]">
              Réservez l&apos;avion. Saisissez le vol. Suivez vos heures.
            </h1>
            <p className="mt-7 max-w-2xl text-xl leading-relaxed text-text-muted sm:text-2xl">
              FlightSchedule centralise vos opérations
              au sein d&apos;une{" "}
              <span className="font-semibold text-text-strong">
                plateforme unique,
              </span>{" "}
              pensée pour simplifier la location de votre avion.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="#calendrier"
                className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-xl bg-brand px-8 py-4 text-xl font-semibold text-text-on-brand shadow-[var(--shadow-brand)] transition-all duration-200 hover:bg-brand-hover hover:shadow-md hover:-translate-y-0.5"
              >
                Découvrir
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </a>
              <Link
                href="/login"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated px-6 py-4 text-lg font-medium text-text shadow-xs transition-colors hover:border-border-strong hover:bg-surface-soft"
              >
                Se connecter
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Preview column */}
          <div className="hero-enter-delayed rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-lg sm:p-6 lg:rotate-1 lg:shadow-xl">
            <PreviewDashboard />
          </div>
        </div>
      </section>

      {/* ── Calendar preview strip ─────────────────────────────── */}
      <section id="calendrier" className="scroll-mt-20 border-y border-border-subtle bg-surface-sunken">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14 lg:px-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
            L&apos;avion est libre samedi&nbsp;? La réponse est là.
          </h2>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-text-muted">
            Chaque pilote voit les réservations du groupe en temps réel.
            Les conflits de créneaux sont détectés automatiquement&nbsp;—
            aucune double réservation possible.
          </p>
          <div className="mt-6 overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-sm">
            <PreviewCalendar />
          </div>
        </div>
      </section>

      {/* ── Flight entry preview (reversed layout) ─────────────── */}
      <section className="relative">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:px-12 lg:py-20">
          {/* Preview column (left on desktop) */}
          <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm sm:p-5 lg:-rotate-1">
            <PreviewFlight />
          </div>

          {/* Text column (right on desktop) */}
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              Bloc OFF, bloc ON. Le vol est saisi.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-text-muted">
              Aéroports OACI, heures moteur, photos du carnet de vol.
              La durée est calculée, le solde est débité. Moins
              d&apos;une minute sur le tarmac.
            </p>
          </div>
        </div>
      </section>

      {/* ── Purchase preview ─────────────────────────────────── */}
      <section className="relative">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:px-12 lg:py-20">
          {/* Text column */}
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              Achetez vos heures. Prix affichés, pas de surprise.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-text-muted">
              Forfaits configurés par votre club. Le détail HT, TVA
              et TTC est affiché avant chaque achat. Carte bancaire
              ou virement — le solde est crédité dès réception.
            </p>
          </div>

          {/* Preview column */}
          <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm sm:p-5 lg:rotate-1">
            <PreviewPurchase />
          </div>
        </div>
      </section>

      {/* ── Pricing / open-source ──────────────────────────────── */}
      <section className="relative">
        <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16 lg:px-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
            Tarifs simples
          </h2>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-text-muted">
            FlightSchedule est open source. Hébergez-le vous-même ou
            laissez-nous faire — mêmes fonctionnalités, même code.
          </p>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {/* Card 1 — Self-hosted */}
            <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-elevated p-6 shadow-sm">
              <h3 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
                Auto-hébergé
              </h3>
              <p className="mt-3 text-base leading-relaxed text-text-muted">
                Clonez le repo, lancez Docker&nbsp;Compose, c&apos;est en
                ligne. Votre serveur, vos données, aucune dépendance.
              </p>
              <p className="mt-5 text-base font-semibold text-success">
                Gratuit — sans limitation
              </p>
              <div className="mt-auto pt-6">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-4 py-2 text-base font-medium text-text shadow-xs transition-colors hover:border-border-strong hover:bg-surface-soft"
                >
                  Voir le code source
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>

            {/* Card 2 — Hosted */}
            <div className="flex flex-col rounded-lg border border-brand-soft-border bg-brand-soft p-6 shadow-sm">
              <h3 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
                Hébergé par nos soins
              </h3>
              <p className="mt-3 text-base leading-relaxed text-text-muted">
                On s&apos;occupe du serveur, des sauvegardes et des mises
                à jour. Vous vous occupez de voler.
              </p>
              <p className="mt-5 text-base font-semibold text-success">
                Gratuit pour 1 avion
              </p>
              <div className="mt-auto pt-6">
                <Link
                  href="/login"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-base font-medium text-text-on-brand shadow-[var(--shadow-brand)] transition-all hover:bg-brand-hover hover:shadow-md"
                >
                  Démarrer
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer + CTA ───────────────────────────────────────── */}
      <footer className="mt-auto border-t border-brand-soft-border bg-brand-soft">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-12">
          {/* Top row */}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href="/" className="group flex items-center gap-2.5">
                <Image
                  src="/logo.png"
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-md ring-1 ring-brand-soft-border"
                />
                <span className="font-display text-xl font-semibold tracking-tight text-text-strong">
                  FlightSchedule
                </span>
              </Link>
              <p className="mt-2 text-base text-text-muted">
                Moins de temps dans les tableurs, plus de temps en
                l&apos;air.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-brand px-5 py-2 text-base font-medium text-text-on-brand shadow-[var(--shadow-brand)] transition-all hover:bg-brand-hover hover:shadow-md"
              >
                Se connecter
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="text-base text-text-subtle">
                Pas encore de compte&nbsp;? Contactez l&apos;administrateur
                de votre aéroclub.
              </p>
            </div>
          </div>

          {/* Bottom row */}
          <div className="mt-8 flex flex-col gap-2 border-t border-brand-soft-border/50 pt-6 text-base text-text-subtle sm:flex-row sm:items-center sm:justify-between">
            <p>
              Open source &middot; Conçu pour les aéroclubs.
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-brand"
            >
              GitHub
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
