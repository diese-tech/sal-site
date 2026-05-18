import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { recalculateAndPersistStandings } from "@/lib/league-data";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const standings = await recalculateAndPersistStandings();
  return NextResponse.json({ ok: true, standings });
}
