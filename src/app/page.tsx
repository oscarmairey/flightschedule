import { redirect } from "next/navigation";

export default function HomePage() {
  // V1: TODO once auth is wired, redirect based on session
  // (authenticated → /dashboard, otherwise → /login)
  redirect("/login");
}
