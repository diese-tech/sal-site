import { NextResponse } from "next/server";
import { errorMessage, reportError } from "@/lib/error-monitor";
import type {
  ScouterDraftConfirmResult,
  ScouterDraftResult,
  ScouterDraftSnapshot,
} from "@/lib/scouter-drafts";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export function requireScouterSupabase() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase not configured.");
  return supabase;
}

export function scouterReceiptUrl(scouterMatchId: string, scouterGameId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sal.gg";
  const url = new URL(`/scouters/${encodeURIComponent(scouterMatchId)}`, siteUrl);
  url.searchParams.set("game", scouterGameId);
  return url.toString();
}

export function draftResponse(result: ScouterDraftResult | ScouterDraftSnapshot) {
  return {
    draft_id: result.draftId,
    revision: result.revision,
    status: result.status,
    game: result.game,
    diagnostics: result.diagnostics,
    ...(hasSnapshotMetadata(result)
      ? {
          season_id: result.seasonId,
          scouter_match_id: result.scouterMatchId,
          game_ordinal: result.gameOrdinal,
          scoreboard_image_path: result.scoreboardImagePath,
          details_image_path: result.detailsImagePath,
        }
      : { existing: result.code === "existing" }),
  };
}

export function confirmResponse(result: ScouterDraftConfirmResult) {
  return {
    code: result.code,
    applied: result.applied,
    draft_id: result.draftId,
    revision: result.revision,
    status: result.status,
    scouter_match_id: result.scouterMatchId,
    scouter_game_id: result.scouterGameId,
    receipt_url: scouterReceiptUrl(result.scouterMatchId, result.scouterGameId),
    ...("identityOverrideApplied" in result
      ? {
          identity_override_applied: result.identityOverrideApplied,
          participants_summary: result.participantsSummary,
        }
      : {}),
  };
}

export function scouterDraftError(
  operation: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  reportError(`scouter draft ${operation} failed`, error, context);
  return NextResponse.json(
    { error: errorMessage(error, `Scouter draft ${operation} failed.`) },
    { status: scouterErrorStatus(error) },
  );
}

export function scouterErrorStatus(error: unknown) {
  if (error instanceof Error && error.message === "Supabase not configured.") return 503;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
  if (code === "P0002") return 404;
  if (code === "42501") return 403;
  if (code === "22023") return 400;
  if (["23503", "23505", "23514", "40001", "55000"].includes(code ?? "")) return 409;
  return 500;
}

function hasSnapshotMetadata(
  result: ScouterDraftResult | ScouterDraftSnapshot,
): result is ScouterDraftSnapshot {
  return "seasonId" in result;
}
