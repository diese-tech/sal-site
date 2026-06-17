import { checkIsAdminDataMock } from "@/lib/league-data";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isMockFallback = await checkIsAdminDataMock();
  return <AdminLayoutClient isMockFallback={isMockFallback}>{children}</AdminLayoutClient>;
}
