import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminRequestSession } from "@/lib/admin-auth";
import { errorMessage } from "@/lib/error-monitor";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const schema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    reviewerNote: z.string().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "rejected" && !value.reviewerNote?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["reviewerNote"],
        message: "A reviewer note is required when rejecting a registration.",
      });
    }
  });

const resultSchema = z.object({
  code: z.enum(["applied", "already_processed"]),
  registrationId: z.string(),
  finalStatus: z.enum(["approved", "rejected"]),
  applied: z.boolean(),
  playerId: z.string().nullable(),
});

type RouteContext = { params: Promise<{ id: string }> };

interface RegistrationReviewDependencies {
  getSession: (request: NextRequest) => { discordId: string } | null;
  resolveRegistration: (input: {
    registrationId: string;
    actorDiscordId: string;
    decision: "approve" | "reject";
    reviewerNote?: string;
  }) => Promise<unknown>;
}

export function createRegistrationReviewHandler(dependencies: RegistrationReviewDependencies) {
  return async function PATCH(request: NextRequest, { params }: RouteContext) {
    const session = dependencies.getSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    if (!id || id.length > 200) {
      return NextResponse.json({ error: "Invalid registration id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const reviewerNote = parsed.data.reviewerNote?.trim() || undefined;
    try {
      const rawResult = await dependencies.resolveRegistration({
        registrationId: id,
        actorDiscordId: session.discordId,
        decision: parsed.data.status === "approved" ? "approve" : "reject",
        reviewerNote,
      });
      const result = resultSchema.safeParse(rawResult);
      if (!result.success) {
        console.error("Registration review returned an invalid database response.", {
          registrationId: id,
        });
        return NextResponse.json(
          { error: "Registration review returned an invalid database response." },
          { status: 502 },
        );
      }

      if (parsed.data.status === "approved") {
        return NextResponse.json({ ok: true, playerId: result.data.playerId });
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message = errorMessage(error, "Unknown error updating registration.");
      console.error(`PATCH /api/admin/registrations/${id} error:`, error);
      return NextResponse.json({ error: message }, { status: databaseErrorStatus(error) });
    }
  };
}

function databaseErrorStatus(error: unknown) {
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

async function resolveRegistration(input: {
  registrationId: string;
  actorDiscordId: string;
  decision: "approve" | "reject";
  reviewerNote?: string;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error } = await supabase.rpc("resolve_registration_review", {
    p_registration_id: input.registrationId,
    p_actor_discord_id: input.actorDiscordId,
    p_decision: input.decision,
    p_reviewer_note: input.reviewerNote,
  });
  if (error) throw error;
  return data;
}

export const PATCH = createRegistrationReviewHandler({
  getSession: getAdminRequestSession,
  resolveRegistration,
});
