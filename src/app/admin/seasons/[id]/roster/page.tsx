import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSeasonRosterClient } from "@/components/admin/AdminSeasonRosterClient";
import { requireAdmin } from "@/lib/admin-auth";
import { getSeasonRosterAdminData } from "@/lib/league-data";

export const metadata = { title: "Manage Season Roster - SAL Admin" };

export default async function AdminSeasonRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    mergedFrom?: string | string[];
    mergedInto?: string | string[];
  }>;
}) {
  const session = await requireAdmin();
  if (session.role !== "super_admin") redirect("/admin");
  const { id } = await params;
  const [data, query] = await Promise.all([getSeasonRosterAdminData(id), searchParams]);
  const mergedFrom = Array.isArray(query.mergedFrom) ? query.mergedFrom[0] : query.mergedFrom;
  const mergedInto = Array.isArray(query.mergedInto) ? query.mergedInto[0] : query.mergedInto;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link href="/admin/seasons" className="text-xs font-black uppercase text-cyan-300 hover:text-cyan-100">← Seasons</Link>
      <div className="mb-6 mt-3">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">Admin · Superadmin</p>
        <h1 className="text-2xl font-black text-white">{data.season.name} Roster</h1>
        <p className="mt-1 text-sm font-semibold text-slate-400">
          {data.orgAssignments.length} divisional teams across {new Set(data.orgAssignments.map((row) => row.org_id)).size} organizations · {data.rosterAssignments.length} players. Global identities remain intact when a season assignment is removed.
        </p>
      </div>
      {mergedFrom && mergedInto && (
        <p role="status" className="mb-4 rounded-xl border border-emerald-300/25 bg-emerald-300/5 p-3 text-sm font-semibold text-emerald-200">
          Organization merge completed. {mergedFrom} was merged into {mergedInto}, which is now the canonical identity.
        </p>
      )}
      <AdminSeasonRosterClient data={data} />
    </main>
  );
}
