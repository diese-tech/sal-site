import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminRequestSession } from "@/lib/admin-auth";
import { errorMessage, reportError } from "@/lib/error-monitor";
import { AdminUsersError, getAdminUsers, removeAdminUser, upsertAdminUser } from "@/lib/admin-users";

// Managing this table is managing who can reach every other /admin route, so
// it's gated to super_admin — a plain admin can't grant themselves or anyone
// else more access than they already have.
function requireSuperAdmin(request: NextRequest) {
  const session = getAdminRequestSession(request);
  if (session?.role !== "super_admin") return null;
  return session;
}

const upsertSchema = z.object({
  discordId: z.string().trim().min(1),
  role: z.enum(["admin", "super_admin"]),
  discordUsername: z.string().trim().max(64).optional(),
  displayName: z.string().trim().max(100).optional(),
});

export async function GET(request: NextRequest) {
  if (!requireSuperAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }
  const admins = await getAdminUsers();
  return NextResponse.json({ admins });
}

export async function POST(request: NextRequest) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }

  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues.map((issue) => issue.message).join("; "),
    }, { status: 400 });
  }

  try {
    const admin = await upsertAdminUser(parsed.data, session.discordId);
    return NextResponse.json({ ok: true, admin });
  } catch (error) {
    if (error instanceof AdminUsersError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    reportError("POST /api/admin/admins", error, { discordId: parsed.data.discordId });
    return NextResponse.json({ error: errorMessage(error, "Unable to save admin.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const discordId = searchParams.get("discordId");
  if (!discordId) return NextResponse.json({ error: "discordId required." }, { status: 400 });

  try {
    await removeAdminUser(discordId, session.discordId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminUsersError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    reportError("DELETE /api/admin/admins", error, { discordId });
    return NextResponse.json({ error: errorMessage(error, "Unable to remove admin.") }, { status: 500 });
  }
}
