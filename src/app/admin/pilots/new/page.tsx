// CAVOK — /admin/pilots/new — create a pilot.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { COPY } from "@/lib/copy";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
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
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href="/admin/pilots"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {COPY.common.back}
        </Link>
        <header className="mt-4 mb-8">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Nouveau pilote
          </h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Créer un compte pilote</CardTitle>
            <CardDescription>
              Un mot de passe temporaire sera généré et envoyé par email. Le
              pilote devra le modifier à sa première connexion.
            </CardDescription>
          </CardHeader>

          <form action={createPilot} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" required>
                Nom complet
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" required>
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                maxLength={255}
              />
            </div>

            {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

            <Button type="submit" fullWidth>
              Créer le compte
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
