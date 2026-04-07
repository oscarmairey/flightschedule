// CAVOK — /admin/pilots/new — create a pilot.

import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { COPY } from "@/lib/copy";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { AppShell } from "@/components/AppShell";
import { createPilot } from "../actions";

export default async function NewPilotPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const errorMessage =
    params.error === "duplicate"
      ? "Un compte existe déjà avec cet email."
      : params.error === "invalid"
        ? COPY.errors.invalidInput
        : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-8 space-y-6">
        <header>
          <Link href="/admin/pilots" className="text-sm text-zinc-500 hover:underline">
            ← {COPY.common.back}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Nouveau pilote</h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Créer un compte pilote</CardTitle>
            <CardDescription>
              Un mot de passe temporaire sera généré et envoyé par email. Le pilote
              devra le modifier à sa première connexion.
            </CardDescription>
          </CardHeader>

          <form action={createPilot} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" required>Nom complet</Label>
              <Input id="name" name="name" type="text" required minLength={2} maxLength={100} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" required>Email</Label>
              <Input id="email" name="email" type="email" required maxLength={255} />
            </div>

            {errorMessage && (
              <p className="text-sm text-red-600" role="alert">{errorMessage}</p>
            )}

            <Button type="submit" fullWidth>Créer le compte</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
