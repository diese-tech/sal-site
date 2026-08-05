import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminRequestSession } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const requestSchema = z
  .object({
    decision: z.enum(["approve", "deny"]),
    note: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "deny" && !value.note?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Add a note when denying a stat record.",
      });
    }
  });

const resultSchema = z.object({
  code: z.enum(["applied", "already_processed"]),
  recordId: z.string(),
  finalStatus: z.enum(["approved", "rejected"]),
  applied: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string }> };

interface StatReviewResolutionDependencies {
  getSession: (request: NextRequest) => { discordId: string } | null;
  resolveStatReview: (input: {
    recordId: string;
    actorDiscordId: string;
    decision: "approve" | "deny";
    note?: string;
  }) => Promise<unknown>;
}

export function createStatReviewResolutionHandler(
  dependencies: StatReviewResolutionDependencies,
) {
  return async function PATCH(request: NextRequest, { params }: RouteContext) {
    const session = dependencies.getSession(request);
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (session.discordId === "password-admin") {
      return NextResponse.json(
        { error: "Sign in with Discord to perform audited ticket actions." },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (!id || id.length > 200) {
      return NextResponse.json({ error: "Invalid stat-review ticket id." }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    try {
      const rawResult = await dependencies.resolveStatReview({
        recordId: id,
        actorDiscordId: session.discordId,
        decision: parsed.data.decision,
        note: parsed.data.note?.trim() || undefined,
      });
      const result = resultSchema.safeParse(rawResult);
      if (!result.success) {
        return NextResponse.json(
          { error: "Stat review returned an invalid database response." },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, status: result.data.finalStatus });
    } catch (error) {
      return NextResponse.json(
        { error: "The stat-review ticket could not be updated." },
        { status: databaseErrorStatus(error) },
      );
    }
  };
}

async function resolveStatReview(input: {
  recordId: string;
  actorDiscordId: string;
  decision: "approve" | "deny";
  note?: string;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase not configured.");
  const { data, error } = await supabase.rpc("resolve_pending_stat_record", {
    p_record_id: input.recordId,
    p_actor_discord_id: input.actorDiscordId,
    p_decision: input.decision,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

function databaseErrorStatus(error: unknown): number {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
  if (code === "P0002") return 404;
  if (code === "42501") return 403;
  if (code === "22023") return 400;
  if (code === "55000" || code === "23505" || code === "23514") return 409;
  return 500;
}

export const PATCH = createStatReviewResolutionHandler({
  getSession: getAdminRequestSession,
  resolveStatReview,
});
