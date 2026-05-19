import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { updateDraftRoom } from "@/lib/draft-data";

const patchSchema = z.object({
  baseOrder: z.array(z.string().min(1)).min(1).optional(),
  rounds: z.number().int().min(1).max(10).optional(),
  pickTimerSeconds: z.number().int().min(30).max(600).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const result = patchSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  try {
    const room = await updateDraftRoom(id, result.data);
    return NextResponse.json({ room });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update draft room.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
