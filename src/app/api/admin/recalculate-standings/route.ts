import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminRequest, isInternalServiceRequest } from "@/lib/admin-auth";
import { recalculateAndPersistStandings } from "@/lib/league-data";
import { errorMessage, reportError } from "@/lib/error-monitor";

// Callable by a logged-in admin (cookie) or by lab-salbot's bot process
// (INTERNAL_SERVICE_TOKEN bearer token) so a Discord-approved match result
// recalculates standings the same way an admin save does (audit F-01).
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request) && !isInternalServiceRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const standings = await recalculateAndPersistStandings();
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true, standings });
  } catch (err) {
    const message = errorMessage(err, "Unknown error recalculating standings.");
    reportError("standings recalculation failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
