import { OrgLogo } from "@/components/card-lab/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getLeagueData } from "@/lib/league-data";

export const metadata = { title: "Manage Teams - SAL Admin" };

export default async function AdminTeamsPage() {
  await requireAdmin();
  const { orgs, standings, players } = await getLeagueData();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">Admin</p>
        <h1 className="text-2xl font-black text-white">Teams</h1>
        <p className="mt-1 text-sm font-semibold text-slate-400">Roster assignment is handled from the Roster screen.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-slate-950/70">
        {orgs.map((org, index) => {
          const standing = standings.find((s) => s.orgId === org.id);
          const captain = players.find((player) => player.id === org.captainId);
          return (
            <div key={org.id} className="grid gap-3 border-b border-white/5 px-4 py-3 last:border-0 sm:grid-cols-[2rem_1fr_7rem_7rem_8rem] sm:items-center">
              <span className="text-xs font-black text-slate-600">{index + 1}</span>
              <div className="flex min-w-0 items-center gap-2.5">
                <OrgLogo initials={org.logoInitials} gradient={org.logoGradient} className="h-8 w-8 shrink-0 text-xs" />
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{org.name}</p>
                  <p className="text-[0.6rem] font-black uppercase text-slate-500">{org.tag}</p>
                </div>
              </div>
              <span className="text-xs font-black uppercase text-cyan-200">{org.divisionId}</span>
              <span className="text-sm font-semibold text-slate-300">{standing?.wins ?? 0}-{standing?.losses ?? 0}</span>
              <span className="truncate text-xs font-semibold text-slate-400">{captain?.ign ?? "No captain"}</span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
