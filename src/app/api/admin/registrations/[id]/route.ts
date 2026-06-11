import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { approveRegistrationAndCreatePlayer, updateRegistrationStatus } from "@/lib/league-data";
import { errorMessage } from "@/lib/error-monitor";

const schema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  reviewerNote: z.string().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    if (parsed.data.status === "approved") {
      // Approval also creates (or links) the player record — see issue #63.
      const playerId = await approveRegistrationAndCreatePlayer(id, parsed.data.reviewerNote);
      return NextResponse.json({ ok: true, playerId });
    }
    await updateRegistrationStatus(id, parsed.data.status, parsed.data.reviewerNote);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = errorMessage(err, "Unknown error updating registration.");
    console.error(`PATCH /api/admin/registrations/${id} error:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
