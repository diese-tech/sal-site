import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getHostReviewSessionFromRequest,
  type HostReviewSession,
} from "@/lib/match-report-host/auth";
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
export interface HostReviewReadDependencies {
  canonicalSiteOrigin: string | null;
  getSession: (request: NextRequest, reportId: string) => HostReviewSession | null;
  readReview: (input: {
    matchReportId: string;
    hostDiscordId: string;
  }) => Promise<HostMatchReportReview | null>;
}

export function createHostReviewReadHandler(dependencies: HostReviewReadDependencies) {
  return async function GET(request: NextRequest, context: RouteContext) {
    if (
      !dependencies.canonicalSiteOrigin ||
      !requestUsesCanonicalOrigin(request, dependencies.canonicalSiteOrigin)
    ) {
      return privateHostReviewNotFound();
    }
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return privateHostReviewNotFound();
    const session = dependencies.getSession(request, id);
    if (!session) return privateHostReviewNotFound();

    try {
      const review = await dependencies.readReview({
        matchReportId: id,
        hostDiscordId: session.hostDiscordId,
      });
      if (!review || review.report.status === "cancelled") return privateHostReviewNotFound();
      return hostReviewJson({ ok: true as const, review });
    } catch {
      return hostReviewJson(
        { ok: false as const, error: "Match report review is temporarily unavailable." },
        503,
      );
    }
  };
}

const persistence = getMatchReportHostPersistence();
export const GET = createHostReviewReadHandler({
  canonicalSiteOrigin: getCanonicalSiteOrigin(),
  getSession: getHostReviewSessionFromRequest,
  readReview: async (input) => persistence?.readReview(input) ?? null,
});
