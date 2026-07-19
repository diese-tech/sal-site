import { checkIsAdminDataMock } from "@/lib/league-data";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";
import { getUnresolvedAdminTicketCount } from "@/lib/admin-ticket-count";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isMockFallback, ticketBadgeCount] = await Promise.all([
    checkIsAdminDataMock(),
    getUnresolvedAdminTicketCount(),
  ]);
  return (
    <AdminLayoutClient
      isMockFallback={isMockFallback}
      ticketBadgeCount={ticketBadgeCount}
    >
      {children}
    </AdminLayoutClient>
  );
}
