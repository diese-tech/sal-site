import { NextRequest } from "next/server";
import { z } from "zod";
import { getHostReviewSessionFromRequest, type HostReviewSession } from "@/lib/match-report-host/auth";
import {
  getCanonicalSiteOrigin,
  hostReviewJson,
  privateHostReviewNotFound,
  requestUsesCanonicalOrigin,
} from "@/lib/match-report-host/http";
import { getMatchReportHostPersistence } from "@/lib/match-report-host/persistence";
import type { HostMatchReportReview } from "@/types/match-report-host";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
export interface HostReviewExtractDependencies {
  canonicalSiteOrigin: string | null;
  getSession: (request: NextRequest, reportId: string) => HostReviewSession | null;
  extract: (input: {
    matchReportId: string;
    hostDiscordId: string;
  }) => Promise<HostMatchReportReview>;
}

export function createHostReviewExtractHandler(dependencies: HostReviewExtractDependencies) {
  return async function POST(request: NextRequest, context: RouteContext) {
    if (
      !dependencies.canonicalSiteOrigin ||
      !requestUsesCanonicalOrigin(request, dependencies.canonicalSiteOrigin)
    ) return privateHostReviewNotFound();
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return privateHostReviewNotFound();
    const session = dependencies.getSession(request, id);
    if (!session) return privateHostReviewNotFound();
    try {
      const review = await dependencies.extract({
        matchReportId: id,
        hostDiscordId: session.hostDiscordId,
      });
      return hostReviewJson({ ok: true as const, review });
    } catch (error) {
      const code = databaseCode(error);
      if (code === "P0002" || code === "PGRST116" || code === "42501") return privateHostReviewNotFound();
      if (code === "22023") return hostReviewJson({ error: "Upload a screenshot before extraction." }, 400);
      if (code === "40001") return hostReviewJson({ error: "This report changed in another tab. Reload and try again." }, 409);
      if (code === "55000") return hostReviewJson({ error: "Both season rosters need five players before stat correction can begin." }, 409);
      return hostReviewJson({ error: "Stat extraction failed. Try again or contact an admin." }, 503);
    }
  };
}

function databaseCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

const persistence = getMatchReportHostPersistence();
export const POST = createHostReviewExtractHandler({
  canonicalSiteOrigin: getCanonicalSiteOrigin(),
  getSession: getHostReviewSessionFromRequest,
  extract: async (input) => {
    if (!persistence) throw new Error("Supabase not configured.");
    return persistence.extractReview(input);
  },
});
