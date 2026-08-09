import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestSession, type AdminSessionPayload } from "@/lib/admin-auth";
import { errorMessage, reportError } from "@/lib/error-monitor";
import {
  applyPlayerMerge,
  PlayerMergeContractError,
  previewPlayerMerge,
  type PlayerMergePreview,
  type PlayerMergeResult,
} from "@/lib/player-merge";

const playerIdSchema = z.string().trim().min(1).max(128);
const playerPairSchema = z.object({
  sourcePlayerId: playerIdSchema,
  targetPlayerId: playerIdSchema,
}).refine((body) => body.sourcePlayerId !== body.targetPlayerId, {
  message: "Source and target players must be different.",
});

const requestSchema = z.discriminatedUnion("action", [
  playerPairSchema.extend({ action: z.literal("preview") }),
  playerPairSchema.extend({ action: z.literal("apply"), confirmation: z.literal("MERGE") }),
]);

interface PlayerMergeHandlerDependencies {
  getSession: (request: NextRequest) => Pick<AdminSessionPayload, "discordId" | "role"> | null;
  previewMerge: (sourcePlayerId: string, targetPlayerId: string) => Promise<PlayerMergePreview>;
  applyMerge: (input: {
    sourcePlayerId: string;
    targetPlayerId: string;
    actorDiscordId: string;
  }) => Promise<PlayerMergeResult>;
  revalidateLeagueData: () => void;
}

function databaseStatus(error: unknown): number {
  if (error instanceof PlayerMergeContractError) return 502;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (code === "42501") return 403;
  if (["22023", "23514", "23505", "40001"].includes(code)) return 409;
  return 500;
}

export function createPlayerMergeHandler(deps: PlayerMergeHandlerDependencies) {
  return async function playerMergeHandler(request: NextRequest) {
    const session = deps.getSession(request);
    if (session?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
      }, { status: 400 });
    }

    try {
      if (parsed.data.action === "preview") {
        const preview = await deps.previewMerge(parsed.data.sourcePlayerId, parsed.data.targetPlayerId);
        return NextResponse.json({ ok: true, preview });
      }

      const result = await deps.applyMerge({
        sourcePlayerId: parsed.data.sourcePlayerId,
        targetPlayerId: parsed.data.targetPlayerId,
        actorDiscordId: session.discordId,
      });
      let warning: string | null = null;
      try {
        deps.revalidateLeagueData();
      } catch (revalidationError) {
        reportError("Player merge league-data revalidation failed", revalidationError, {
          sourcePlayerId: parsed.data.sourcePlayerId,
          targetPlayerId: parsed.data.targetPlayerId,
        });
        warning = "Players were merged, but league data could not be refreshed.";
      }
      return NextResponse.json({ ok: true, ...result, warning });
    } catch (error) {
      reportError("POST /api/admin/players/merge", error, {
        sourcePlayerId: parsed.data.sourcePlayerId,
        targetPlayerId: parsed.data.targetPlayerId,
        action: parsed.data.action,
      });
      return NextResponse.json({
        error: errorMessage(error, "Unable to merge players."),
      }, { status: databaseStatus(error) });
    }
  };
}

export const POST = createPlayerMergeHandler({
  getSession: getAdminRequestSession,
  previewMerge: previewPlayerMerge,
  applyMerge: applyPlayerMerge,
  revalidateLeagueData: () => revalidateTag("league-data", {}),
});
