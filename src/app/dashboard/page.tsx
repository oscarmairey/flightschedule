// Pilot dashboard — placeholder for V1 implementation.
// PRD §3.4: HDV balance, recent flights, transaction history.

import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Bienvenue, {session.user.name}
          {session.user.role === "ADMIN" && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              Administrateur
            </span>
          )}
        </p>
      </header>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        Le tableau de bord pilote sera implémenté prochainement (PRD §3.4).
      </div>
    </main>
  );
}
