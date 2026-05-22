import { NextResponse, type NextRequest } from "next/server";
import { submitGodDraftAction } from "@/lib/god-draft-data";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sessionId?: string; godId?: string; timeout?: boolean };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    if (!body.timeout && !body.godId) return NextResponse.json({ error: "godId is required." }, { status: 400 });
    await submitGodDraftAction(body.sessionId, body.godId ?? "", Boolean(body.timeout));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft action failed." }, { status: 400 });
  }
}
