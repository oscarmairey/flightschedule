import { redirect } from "next/navigation";

export default async function LegacyNewFlightPage() {
  redirect("/flights");
}
