import { redirect } from "next/navigation";
import Image from "next/image";
import { AuthError } from "next-auth";
import { signIn, auth } from "@/auth";
import { COPY } from "@/lib/copy";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.mustResetPw ? "/setup-password" : "/dashboard");
  }

  const params = await searchParams;
  const errorMessage =
    params.error === "CredentialsSignin"
      ? COPY.auth.invalidCredentials
      : params.error
        ? COPY.auth.genericError
        : null;

  return (
    <main className="relative flex min-h-screen flex-col bg-surface">
      {/* Asymmetric brand-tinted aura — replaces the centered card template */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-brand-soft opacity-70 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-[420px] w-[420px] rounded-full bg-warning-soft opacity-50 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 lg:flex-row lg:items-center lg:gap-16 lg:px-12 lg:py-16">
        {/* Left: brand voice */}
        <section className="lg:flex-1 lg:pr-8">
          <Image
            src="/logo.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded-xl ring-1 ring-border shadow-sm"
            priority
          />
          <h1 className="font-display mt-8 text-5xl font-semibold tracking-tight text-text-strong sm:text-6xl">
            FlightSchedule
          </h1>
          <p className="mt-3 max-w-md text-sm font-medium uppercase tracking-[0.22em] text-text-muted">
            {COPY.brand.tagline}
          </p>
          <p className="mt-6 max-w-md text-base leading-relaxed text-text-muted">
            L&apos;app pour gérer simplement le planning de réservation de votre
            avion. Réservations, heures de vol, carnet de bord — tout en un
            endroit, partout, depuis votre poche.
          </p>
        </section>

        {/* Right: sign-in form */}
        <section className="mt-12 w-full max-w-md lg:mt-0 lg:flex-1">
          <div className="rounded-2xl border border-border bg-surface-elevated/95 p-8 shadow-lg backdrop-blur">
            <div className="mb-6">
              <h2 className="text-xl font-semibold tracking-tight text-text-strong">
                {COPY.auth.loginTitle}
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                {COPY.auth.loginRestricted}
              </p>
            </div>

            <form
              action={async (formData) => {
                "use server";
                // Auth.js v5's `signIn()` with `redirectTo` throws in both
                // branches: NEXT_REDIRECT on success (that's how Next's
                // `redirect()` works), and `AuthError` (CredentialsSignin,
                // etc.) on failure. We MUST let NEXT_REDIRECT propagate,
                // and MUST catch AuthError so it becomes a ?error=... query
                // param instead of a runtime error overlay.
                try {
                  await signIn("credentials", {
                    email: formData.get("email"),
                    password: formData.get("password"),
                    redirectTo: "/dashboard",
                  });
                } catch (error) {
                  if (error instanceof AuthError) {
                    redirect(`/login?error=${error.type}`);
                  }
                  throw error;
                }
              }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="email" required>
                  {COPY.auth.emailLabel}
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="vous@exemple.fr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" required>
                  {COPY.auth.passwordLabel}
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>

              {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

              <SubmitButton fullWidth size="lg" pendingLabel="Connexion…">
                {COPY.auth.signIn}
              </SubmitButton>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-text-subtle">
            Mot de passe oublié&nbsp;? Contactez l&apos;administrateur de
            l&apos;aéroclub.
          </p>
        </section>
      </div>
    </main>
  );
}
