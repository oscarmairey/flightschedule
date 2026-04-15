import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";

export default async function AdminOverviewPage() {
  await requireAdmin();
  redirect("/admin/pilots");
}
