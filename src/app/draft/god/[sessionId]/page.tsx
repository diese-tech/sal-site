import { notFound } from "next/navigation";
import { GodDraftRoomClient } from "@/components/draft/GodDraftRoomClient";
import { getGodDraftRoomData } from "@/lib/god-draft-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Smite 2 Draft - SAL" };

export default async function GodDraftPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const data = await getGodDraftRoomData(sessionId);
  if (!data) notFound();

  const clientKey = [
    data.session.id,
    data.session.status,
    data.session.homeReady,
    data.session.awayReady,
    data.session.currentPhaseIndex,
    data.session.currentStepIndex,
    data.session.resetRequestedBy ?? "none",
    data.chatMessages.at(-1)?.id ?? "no-chat",
  ].join(":");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <GodDraftRoomClient key={clientKey} initialData={data} />
    </main>
  );
}
