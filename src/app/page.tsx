// FlySchedule — root redirect.
//
// Authenticated → /dashboard. Otherwise → /login. The proxy will then
// kick the user to /setup-password if `mustResetPw` is set.

import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
