import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { buildDraftState, getDraftRooms } from "@/lib/draft-data";
import { getLeagueData } from "@/lib/league-data";
import { AdminDraftRoomClient } from "@/components/admin/AdminDraftRoomClient";

export const dynamic = "force-dynamic";

export default async function AdminDraftRoomPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [state, { orgs, players }] = await Promise.all([buildDraftState(id), getLeagueData()]);
  if (!state) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">Admin · Draft · {id}</p>
        <h1 className="text-2xl font-black text-white capitalize">{state.room.divisionId} Division Draft</h1>
      </div>
      <AdminDraftRoomClient state={state} orgs={orgs} players={players} />
    </main>
  );
}
