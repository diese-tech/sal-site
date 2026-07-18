import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdminRequest } from "@/lib/admin-auth";
import { errorMessage } from "@/lib/error-monitor";
import {
  removeSeasonOrgAssignment,
  removeSeasonRosterAssignment,
  saveSeasonOrgAssignment,
  saveSeasonRosterAssignment,
} from "@/lib/league-data";

const divisionSchema = z.enum(["solar", "lunar", "terra"]);
const saveSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("org"),
    orgId: z.string().min(1),
    divisionId: divisionSchema,
  }),
  z.object({
    entity: z.literal("player"),
    playerId: z.string().min(1),
    orgId: z.string().min(1).nullable(),
    divisionId: divisionSchema.nullable(),
    isCaptain: z.boolean(),
  }),
]);
const removeSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("org"), orgId: z.string().min(1) }),
  z.object({ entity: z.literal("player"), playerId: z.string().min(1) }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  }
  const { id: seasonId } = await params;
  try {
    if (parsed.data.entity === "org") {
      await saveSeasonOrgAssignment(seasonId, parsed.data.orgId, parsed.data.divisionId);
    } else {
      await saveSeasonRosterAssignment({ seasonId, ...parsed.data });
    }
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`POST /api/admin/seasons/${seasonId}/roster error:`, error);
    return NextResponse.json({ error: errorMessage(error, "Unable to save season roster assignment.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  }
  const { id: seasonId } = await params;
  try {
    if (parsed.data.entity === "org") {
      await removeSeasonOrgAssignment(seasonId, parsed.data.orgId);
    } else {
      await removeSeasonRosterAssignment(seasonId, parsed.data.playerId);
    }
    revalidateTag("league-data", {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/admin/seasons/${seasonId}/roster error:`, error);
    return NextResponse.json({ error: errorMessage(error, "Unable to remove season roster assignment.") }, { status: 500 });
  }
}
