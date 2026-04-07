// First-login password setup — placeholder for V1 implementation.
// PRD §2.3 + §8.1: forced password reset on first login (mustResetPw flag).

import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function SetupPasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.mustResetPw) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Définir votre mot de passe
        </h1>
        <p>Le formulaire de définition initiale sera implémenté prochainement.</p>
      </div>
    </main>
  );
}
