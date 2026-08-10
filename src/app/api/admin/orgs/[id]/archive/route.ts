import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminRequest } from "@/lib/admin-auth";
import { archiveRecord, unarchiveRecord } from "@/lib/league-data";
import { errorMessage } from "@/lib/error-monitor";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized. Admin required." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { unarchive?: boolean };

  try {
    if (body.unarchive) {
      await unarchiveRecord("orgs", id);
    } else {
      await archiveRecord("orgs", id);
    }
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = errorMessage(err, "Unknown error archiving org.");
    console.error(`POST /api/admin/orgs/${id}/archive error:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
