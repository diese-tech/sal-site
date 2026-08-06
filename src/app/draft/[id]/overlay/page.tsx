import { notFound } from "next/navigation";
import { buildDraftState } from "@/lib/draft-data";
import { getLeagueData } from "@/lib/league-data";
import { DraftOverlayClient } from "@/components/draft/DraftOverlayClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Draft Overlay: ${id} – SAL` };
}

export default async function DraftOverlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [state, { orgs, players }] = await Promise.all([
    buildDraftState(id),
    getLeagueData(),
  ]);

  if (!state) notFound();

  return <DraftOverlayClient initialState={state} orgs={orgs} players={players} draftId={id} />;
}
