// CAVOK — first-login (and admin-reset) password setup.
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
import { auth, unstable_update } from "@/auth";
import { prisma } from "@/lib/db";
import { hash } from "bcryptjs";
import { PasswordSchema } from "@/lib/validation";
import { COPY } from "@/lib/copy";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

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
  // The JWT callback at src/auth.config.ts:53-67 propagates this.
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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {COPY.auth.setupTitle}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {COPY.auth.setupIntro}
          </p>
        </header>

        <form
          action={setupPasswordAction}
          className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
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

          {errorMessage && (
            <p className="text-sm text-red-600" role="alert">
              {errorMessage}
            </p>
          )}

          <p className="text-xs text-zinc-500">
            10 caractères minimum, avec au moins une majuscule, une minuscule et un chiffre.
          </p>

          <Button type="submit" fullWidth>
            {COPY.auth.setupSubmit}
          </Button>
        </form>
      </div>
    </main>
  );
}
