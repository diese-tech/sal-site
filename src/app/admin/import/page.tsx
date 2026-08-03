import { requireAdmin } from "@/lib/admin-auth";
import { getAllSeasons } from "@/lib/league-data";
import { AdminImportClient } from "@/components/admin/AdminImportClient";

export const metadata = { title: "Player Import - SAL Admin" };

export default async function AdminImportPage() {
  await requireAdmin();
  const seasons = await getAllSeasons();
  return <AdminImportClient seasons={seasons} />;
}
