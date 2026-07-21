import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminTicketQueue } from "@/lib/admin-tickets";
import { capabilitiesForAdminRole } from "@/types/admin-ticket";
import { AdminTicketsClient } from "@/components/admin/AdminTicketsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets - SAL Admin" };

export default async function AdminTicketsPage() {
  const session = await requireAdmin();
  const queue = await getAdminTicketQueue();
  const capabilities = capabilitiesForAdminRole(session.role);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">Admin · Operations</p>
        <h1 className="text-2xl font-black text-white">Tickets</h1>
        <p className="mt-1 text-xs text-slate-500">
          One queue for review work across the league. Safe actions are available here, with owning workflows linked for everything else.
        </p>
      </div>
      <Suspense>
        <AdminTicketsClient
          key={queue.tickets.map((ticket) => `${ticket.id}:${ticket.sourceStatus}:${ticket.updatedAt}`).join("|")}
          tickets={queue.tickets}
          sourceHealth={queue.sourceHealth}
          seasonNames={queue.seasonNames}
          divisionNames={queue.divisionNames}
          capabilities={capabilities}
        />
      </Suspense>
    </div>
  );
}
