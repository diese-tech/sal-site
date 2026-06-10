import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminRequest } from "@/lib/admin-auth";
import { recalculateAndPersistStandings } from "@/lib/league-data";
import { reportError } from "@/lib/error-monitor";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const standings = await recalculateAndPersistStandings();
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true, standings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error recalculating standings.";
    reportError("standings recalculation failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
