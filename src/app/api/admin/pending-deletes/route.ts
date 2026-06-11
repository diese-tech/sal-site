import { NextRequest, NextResponse } from "next/server";
import { isSuperAdminRequest } from "@/lib/admin-auth";
import { getPendingDeletes } from "@/lib/league-data";
import { errorMessage } from "@/lib/error-monitor";

export async function GET(request: NextRequest) {
  if (!isSuperAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }

  try {
    const pending = await getPendingDeletes();
    return NextResponse.json({ pending });
  } catch (err) {
    const message = errorMessage(err, "Unknown error fetching pending deletes.");
    console.error("GET /api/admin/pending-deletes error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
