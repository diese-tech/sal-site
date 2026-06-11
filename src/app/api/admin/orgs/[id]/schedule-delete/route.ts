import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isSuperAdminRequest } from "@/lib/admin-auth";
import { scheduleDelete } from "@/lib/league-data";
import { errorMessage } from "@/lib/error-monitor";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }

  const { id } = await params;

  try {
    await scheduleDelete("orgs", id);
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = errorMessage(err, "Unknown error scheduling org for deletion.");
    console.error(`POST /api/admin/orgs/${id}/schedule-delete error:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
