import { requireAdmin } from "@/lib/admin-auth";
import { getLeagueData } from "@/lib/league-data";
import { AdminMatchesClient } from "@/components/admin/AdminMatchesClient";
import { StandingsTable } from "@/components/league/StandingsTable";

export const metadata = { title: "Manage Standings - SAL Admin" };

export default async function AdminStandingsPage() {
  await requireAdmin();
  const data = await getLeagueData();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">Admin</p>
        <h1 className="text-2xl font-black text-white">Score-Driven Standings</h1>
        <p className="mt-1 text-sm font-semibold text-slate-400">
          Standings are recalculated from completed match scores. Edit a match score/status below to update the table.
        </p>
      </div>
      <div className="mb-8">
        <StandingsTable divisions={data.divisions} standings={data.standings} orgs={data.orgs} />
      </div>
      <AdminMatchesClient data={data} />
    </main>
  );
}
