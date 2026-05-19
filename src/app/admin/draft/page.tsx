import { requireAdmin } from "@/lib/admin-auth";
import { getDraftRooms } from "@/lib/draft-data";
import { getLeagueData } from "@/lib/league-data";
import { AdminDraftListClient } from "@/components/admin/AdminDraftListClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Draft Rooms – SAL Admin" };

export default async function AdminDraftPage() {
  await requireAdmin();
  const [rooms, { season, divisions }] = await Promise.all([getDraftRooms(), getLeagueData()]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">Admin · Draft</p>
        <h1 className="text-2xl font-black text-white">Draft Rooms</h1>
        <p className="mt-1 text-sm font-semibold text-slate-400">
          Create and manage draft rooms per division. Share captain tokens with team captains.
        </p>
      </div>
      <AdminDraftListClient rooms={rooms} season={season} divisions={divisions} />
    </main>
  );
}
