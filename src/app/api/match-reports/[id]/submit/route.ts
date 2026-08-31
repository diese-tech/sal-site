import { NextRequest } from "next/server";
import { z } from "zod";
import { getHostReviewSessionFromRequest, type HostReviewSession } from "@/lib/match-report-host/auth";
import { submitResultSchema } from "@/lib/match-report-host/contracts";
import {
  getCanonicalSiteOrigin,
  hostReviewJson,
  privateHostReviewNotFound,
  requestUsesCanonicalOrigin,
} from "@/lib/match-report-host/http";
import { getMatchReportHostPersistence } from "@/lib/match-report-host/persistence";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ revision: z.number().int().min(1) }).strict();
type SubmitResult = z.infer<typeof submitResultSchema>;
type RouteContext = { params: Promise<{ id: string }> };

export interface SubmitHostReviewDependencies {
  canonicalSiteOrigin: string | null;
  getSession: (request: NextRequest, reportId: string) => HostReviewSession | null;
  submitReview: (input: {
    matchReportId: string;
    hostDiscordId: string;
    expectedRevision: number;
  }) => Promise<SubmitResult>;
}

export function createSubmitHostReviewHandler(dependencies: SubmitHostReviewDependencies) {
  return async function POST(request: NextRequest, context: RouteContext) {
    if (
      !dependencies.canonicalSiteOrigin ||
      !requestUsesCanonicalOrigin(request, dependencies.canonicalSiteOrigin)
    ) return privateHostReviewNotFound();
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return privateHostReviewNotFound();
    const session = dependencies.getSession(request, id);
    if (!session) return privateHostReviewNotFound();
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return hostReviewJson({ ok: false as const, error: "Invalid revision." }, 400);

    try {
      const result = await dependencies.submitReview({
        matchReportId: id,
        hostDiscordId: session.hostDiscordId,
        expectedRevision: parsed.data.revision,
      });
      return hostReviewJson({ ok: true as const, result });
    } catch (error) {
      const code = databaseCode(error);
      if (code === "P0002" || code === "42501") return privateHostReviewNotFound();
      if (code === "40001") {
        return hostReviewJson(
          { ok: false as const, error: "This report changed in another tab. Reload before submitting." },
          409,
        );
      }
      if (code === "22023" || code === "23505" || code === "23514") {
        return hostReviewJson(
          {
            ok: false as const,
            error: "Resolve every unlinked, duplicate, or ambiguous player and complete both five-player teams.",
          },
          409,
        );
      }
      return hostReviewJson({ ok: false as const, error: "The report could not be submitted." }, 503);
    }
  };
}

function databaseCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

const persistence = getMatchReportHostPersistence();
export const POST = createSubmitHostReviewHandler({
  canonicalSiteOrigin: getCanonicalSiteOrigin(),
  getSession: getHostReviewSessionFromRequest,
  submitReview: async (input) => {
    if (!persistence) throw new Error("Supabase not configured.");
    return persistence.submitReview(input);
  },
});
