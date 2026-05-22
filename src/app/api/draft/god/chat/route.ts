import { NextResponse, type NextRequest } from "next/server";
import { sendGodDraftChatMessage } from "@/lib/god-draft-data";
import type { DraftChatChannel } from "@/types/god-draft";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sessionId?: string; channel?: DraftChatChannel; body?: string };
    if (!body.sessionId || !body.channel || typeof body.body !== "string") {
      return NextResponse.json({ error: "sessionId, channel, and body are required." }, { status: 400 });
    }
    await sendGodDraftChatMessage(body.sessionId, body.channel, body.body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft chat failed." }, { status: 400 });
  }
}
