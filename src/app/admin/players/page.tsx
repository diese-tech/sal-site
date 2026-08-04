import { requireAdmin } from "@/lib/admin-auth";
import { getAdminIdentityCatalog, getAdminLeagueData } from "@/lib/league-data";
import { mergeSeasonAndCatalogOrgs, mergeSeasonAndCatalogPlayers } from "@/lib/season-scope";
import { AdminPlayersClient } from "@/components/admin/AdminPlayersClient";

export const metadata = { title: "Edit Roster - SAL Admin" };

export default async function AdminPlayersPage() {
  const session = await requireAdmin();
  const [data, catalog] = await Promise.all([getAdminLeagueData(), getAdminIdentityCatalog()]);
  const playersData = {
    ...data,
    orgs: mergeSeasonAndCatalogOrgs(data.orgs, catalog.orgs),
    players: mergeSeasonAndCatalogPlayers(data.players, catalog.players),
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">Admin</p>
        <h1 className="text-2xl font-black text-white">Edit Roster</h1>
      </div>
      <AdminPlayersClient data={playersData} isSuperAdmin={session.role === "super_admin"} />
    </main>
  );
}
