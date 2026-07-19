import { checkIsAdminDataMock } from "@/lib/league-data";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";
import { getUnresolvedAdminTicketCount } from "@/lib/admin-ticket-count";
import { getAdminSession } from "@/lib/admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  const [isMockFallback, ticketBadgeCount] = session
    ? await Promise.all([checkIsAdminDataMock(), getUnresolvedAdminTicketCount()])
    : [false, null];
  return (
    <AdminLayoutClient
      isMockFallback={isMockFallback}
      ticketBadgeCount={ticketBadgeCount}
    >
      {children}
    </AdminLayoutClient>
  );
}
