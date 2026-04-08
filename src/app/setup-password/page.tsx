// FlightSchedule — first-login (and admin-reset) password setup.
//
// Triggered by `User.mustResetPw = true` (set by `prisma/seed.ts` for new
// pilots and by `resetPilotPassword` admin action). The proxy at
// `src/proxy.ts` redirects any authenticated request to here until the
// flag is cleared.
//
// Server action flow:
//   1. Validate the new password with Zod (PasswordSchema)
//   2. Verify confirmation matches
//   3. bcrypt-hash, write to User.passwordHash, set mustResetPw=false
//   4. Refresh the JWT via Auth.js `unstable_update` so the next request
//      sees the cleared flag and the proxy doesn't bounce the user back
//   5. Redirect to /dashboard

import { redirect } from "next/navigation";
import Image from "next/image";
import { auth, unstable_update } from "@/auth";
import { prisma } from "@/lib/db";
import { hash } from "bcryptjs";
import { PasswordSchema } from "@/lib/validation";
import { COPY } from "@/lib/copy";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

async function setupPasswordAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    redirect("/setup-password?error=invalid");
  }

  if (newPassword !== confirmPassword) {
    redirect("/setup-password?error=mismatch");
  }

  const parsed = PasswordSchema.safeParse(newPassword);
  if (!parsed.success) {
    redirect("/setup-password?error=weak");
  }

  const passwordHash = await hash(parsed.data, 12);

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash,
      mustResetPw: false,
    },
  });

  // Refresh the JWT so the proxy stops sending us back here.
  // The JWT callback at src/auth.config.ts reads this from
  // `session.user.mustResetPw`. Passing it elsewhere silently no-ops and
  // traps the pilot in a redirect loop on /setup-password.
  await unstable_update({
    user: { mustResetPw: false },
  });

  redirect("/dashboard");
}

export default async function SetupPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.mustResetPw) redirect("/dashboard");

  const params = await searchParams;
  const errorMessage =
    params.error === "weak"
      ? COPY.auth.pwTooWeak
      : params.error === "mismatch"
        ? COPY.auth.pwMismatch
        : params.error === "invalid"
          ? COPY.errors.invalidInput
          : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-surface px-6 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 right-0 h-[420px] w-[420px] rounded-full bg-brand-soft opacity-60 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/logo.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 rounded-lg ring-1 ring-border-subtle shadow-xs"
            priority
          />
          <span className="font-display text-2xl font-semibold tracking-tight text-text-strong">
            FlightSchedule
          </span>
        </div>

        <h1 className="font-display text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
          {COPY.auth.setupTitle}
        </h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-text-muted">
          {COPY.auth.setupIntro}
        </p>

        <form
          action={setupPasswordAction}
          className="mt-10 space-y-5 rounded-2xl border border-border bg-surface-elevated p-7 shadow-lg"
        >
          <div className="space-y-2">
            <Label htmlFor="newPassword" required>
              {COPY.auth.newPassword}
            </Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" required>
              {COPY.auth.confirmPassword}
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
            />
          </div>

          {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

          <p className="rounded-md bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-text-muted">
            10 caractères minimum, dont au moins une majuscule, une minuscule
            et un chiffre.
          </p>

          <Button type="submit" fullWidth size="lg">
            {COPY.auth.setupSubmit}
          </Button>
        </form>
      </div>
    </main>
  );
}
