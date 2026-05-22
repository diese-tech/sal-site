import { NextResponse, type NextRequest } from "next/server";
import { requestGodDraftReset } from "@/lib/god-draft-data";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sessionId?: string };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    await requestGodDraftReset(body.sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft reset failed." }, { status: 400 });
  }
}
