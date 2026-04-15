// FlightSchedule — server actions for the /welcome onboarding flow.
//
// All three actions follow the same shape: write the timestamp on the
// User row in Postgres, then refresh the JWT via `unstable_update` so
// the proxy at src/proxy.ts stops sending the pilot back to /welcome.
//
// FOOT-GUN — same as /setup-password: the Auth.js v5 update API only
// reads keys nested under `user`. Calling
//   unstable_update({ onboardingCompletedAt: "..." })
// silently no-ops and traps the pilot in a redirect loop on /welcome.
// The JWT callback in src/auth.config.ts only inspects
// `session.user.onboardingCompletedAt`.

"use server";

import { redirect } from "next/navigation";
import { auth, unstable_update } from "@/auth";
import { prisma } from "@/lib/db";

async function markOnboardedFor(userId: string): Promise<string> {
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompletedAt: now },
  });
  const iso = now.toISOString();
  await unstable_update({
    user: { onboardingCompletedAt: iso },
  });
  return iso;
}

export async function completeOnboarding(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await markOnboardedFor(session.user.id);
  redirect("/calendar");
}

export async function skipOnboarding(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await markOnboardedFor(session.user.id);
  redirect("/dashboard");
}

// Admin-only "Rejouer l'onboarding" — clears the timestamp on the
// caller's OWN account (never another user). The companion client
// component clears the per-browser hint dismissals before submitting,
// so the full first-run experience replays end-to-end.
export async function resetOwnOnboarding(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingCompletedAt: null },
  });
  await unstable_update({
    user: { onboardingCompletedAt: null },
  });
  redirect("/welcome");
}
