import { NextResponse, type NextRequest } from "next/server";
import { setGodDraftReady } from "@/lib/god-draft-data";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sessionId?: string; ready?: boolean };
    if (!body.sessionId || typeof body.ready !== "boolean") {
      return NextResponse.json({ error: "sessionId and ready are required." }, { status: 400 });
    }
    await setGodDraftReady(body.sessionId, body.ready);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft ready failed." }, { status: 400 });
  }
}
