import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAdminRequestSession,
  type AdminSessionPayload,
} from "@/lib/admin-auth";
import {
  deletePendingDraftRoom,
  voidDraftRoom,
  type DraftRoomLifecycleResult,
} from "@/lib/draft-data";
import { errorMessage, reportError } from "@/lib/error-monitor";

const lifecycleSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), confirmation: z.literal("DELETE") }),
  z.object({
    action: z.literal("void"),
    confirmation: z.literal("VOID"),
    reason: z.string().trim().min(1).max(500),
  }),
]);

interface DraftRoomLifecycleDependencies {
  getSession: (request: NextRequest) => Pick<AdminSessionPayload, "discordId" | "role"> | null;
  deletePending: (draftRoomId: string, actorDiscordId: string) => Promise<DraftRoomLifecycleResult>;
  voidRoom: (
    draftRoomId: string,
    actorDiscordId: string,
    reason: string,
  ) => Promise<DraftRoomLifecycleResult>;
  revalidateDraft: (draftRoomId: string) => void;
}

function databaseStatus(error: unknown): number {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["23514", "23505", "40001"].includes(code)) return 409;
  return 500;
}

export function createDraftRoomLifecycleHandler(deps: DraftRoomLifecycleDependencies) {
  return async function draftRoomLifecycleHandler(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const session = deps.getSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    const parsed = lifecycleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
      }, { status: 400 });
    }

    try {
      const result = parsed.data.action === "delete"
        ? await deps.deletePending(id, session.discordId)
        : await deps.voidRoom(id, session.discordId, parsed.data.reason);
      deps.revalidateDraft(id);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      reportError("POST /api/admin/draft/[id]/lifecycle", error, {
        draftRoomId: id,
        action: parsed.data.action,
        actorDiscordId: session.discordId,
      });
      return NextResponse.json({
        error: errorMessage(error, "Unable to update the draft room lifecycle."),
      }, { status: databaseStatus(error) });
    }
  };
}

export const POST = createDraftRoomLifecycleHandler({
  getSession: getAdminRequestSession,
  deletePending: deletePendingDraftRoom,
  voidRoom: voidDraftRoom,
  revalidateDraft: (draftRoomId) => {
    revalidatePath("/admin/draft");
    revalidatePath(`/admin/draft/${draftRoomId}`);
  },
});
