import { notFound } from "next/navigation";
import { buildDraftState } from "@/lib/draft-data";
import { getLeagueData } from "@/lib/league-data";
import { getCaptainSession } from "@/lib/captain-auth";
import { DraftBoardClient } from "@/components/draft/DraftBoardClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Draft: ${id} – SAL` };
}

export default async function DraftBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  const [state, { orgs, players }, captainSession] = await Promise.all([
    buildDraftState(id),
    getLeagueData(),
    getCaptainSession(),
  ]);

  if (!state) notFound();

  const captainOrgId =
    captainSession?.draftRoomId === id ? captainSession.orgId : null;

  return (
    <DraftBoardClient
      initialState={state}
      orgs={orgs}
      players={players}
      captainOrgId={captainOrgId}
      tokenToExchange={token}
      draftId={id}
    />
  );
}
