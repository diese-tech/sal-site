import { NextResponse, type NextRequest } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-auth";
import {
  correctScouterGame,
  scouterCorrectionRequestSchema,
  type ScouterCorrectionRequest,
  type ScouterCorrectionResult,
} from "@/lib/scouter-corrections";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ gameId: string }> };

interface ScouterCorrectionDependencies {
  getSession: (request: NextRequest) => { discordId: string } | null;
  correctGame: (
    gameId: string,
    actorDiscordId: string,
    input: ScouterCorrectionRequest,
  ) => Promise<ScouterCorrectionResult>;
}

export function createScouterGameCorrectionHandler(
  dependencies: ScouterCorrectionDependencies,
) {
  return async function PATCH(request: NextRequest, { params }: RouteContext) {
    const session = dependencies.getSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (session.discordId === "password-admin") {
      return NextResponse.json(
        { error: "Sign in with Discord to create an audited correction." },
        { status: 403 },
      );
    }

    const { gameId } = await params;
    if (!gameId || gameId.length > 200) {
      return NextResponse.json({ error: "Invalid scouter game id." }, { status: 400 });
    }

    const parsed = scouterCorrectionRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid correction." },
        { status: 400 },
      );
    }

    try {
      const result = await dependencies.correctGame(
        gameId,
        session.discordId,
        parsed.data,
      );
      return NextResponse.json({
        ok: true,
        applied: result.applied,
        correctionId: result.correctionId,
        revision: result.revision,
      });
    } catch (error) {
      return NextResponse.json(
        { error: correctionErrorMessage(error) },
        { status: correctionErrorStatus(error) },
      );
    }
  };
}

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function correctionErrorStatus(error: unknown): number {
  const code = databaseCode(error);
  if (code === "P0002") return 404;
  if (code === "42501") return 403;
  if (code === "22023") return 400;
  if (["40001", "23503", "23505", "23514"].includes(code ?? "")) return 409;
  return 500;
}

function correctionErrorMessage(error: unknown): string {
  if (databaseCode(error) === "40001") {
    return "This game changed after you opened it. Refresh and review the latest revision.";
  }
  return "The scouter correction could not be saved.";
}

async function applyCorrection(
  gameId: string,
  actorDiscordId: string,
  input: ScouterCorrectionRequest,
) {
  const client = getSupabaseServerClient();
  if (!client) throw new Error("Supabase not configured.");
  return correctScouterGame(client, gameId, actorDiscordId, input);
}

export const PATCH = createScouterGameCorrectionHandler({
  getSession: getAdminRequestSession,
  correctGame: applyCorrection,
});
