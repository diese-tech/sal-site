import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminRequest } from "@/lib/admin-auth";
import { deleteAnnouncement } from "@/lib/league-data";
import { errorMessage } from "@/lib/error-monitor";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  try {
    await deleteAnnouncement(id);
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/announcements/[id] error:", err);
    return NextResponse.json({ error: errorMessage(err, "Unknown error.") }, { status: 500 });
  }
}
