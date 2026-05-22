import { notFound } from "next/navigation";
import { GodDraftRoomClient } from "@/components/draft/GodDraftRoomClient";
import { getGodDraftRoomData } from "@/lib/god-draft-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "God Draft - SAL" };

export default async function GodDraftPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const data = await getGodDraftRoomData(sessionId);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <GodDraftRoomClient initialData={data} />
    </main>
  );
}
