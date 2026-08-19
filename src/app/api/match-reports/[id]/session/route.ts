import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setHostReviewSessionCookie,
  hostReviewSessionIsConfigured,
  type HostReviewSession,
} from "@/lib/match-report-host/auth";
import {
  getCanonicalSiteOrigin,
  hostReviewJson,
  privateHostReviewNotFound,
  requestUsesCanonicalOrigin,
} from "@/lib/match-report-host/http";
import {
  getMatchReportHostPersistence,
  type ConsumedHostReviewToken,
} from "@/lib/match-report-host/persistence";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

const reportIdSchema = z.string().uuid();
type RouteContext = { params: Promise<{ id: string }> };

export interface HostReviewSessionDependencies {
  canonicalSiteOrigin: string | null;
  consumeToken: (tokenHash: string) => Promise<ConsumedHostReviewToken | null>;
  setSession: (
    response: NextResponse,
    session: Omit<HostReviewSession, "expiresAt">,
  ) => void;
}

export function createHostReviewSessionHandler(
  dependencies: HostReviewSessionDependencies,
) {
  return async function POST(request: NextRequest, context: RouteContext) {
    const canonicalOrigin = dependencies.canonicalSiteOrigin;
    if (!canonicalOrigin || !requestUsesCanonicalOrigin(request, canonicalOrigin)) {
      return privateHostReviewNotFound();
    }
    const { id } = await context.params;
    if (!reportIdSchema.safeParse(id).success) return privateHostReviewNotFound();

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return privateHostReviewNotFound();

    let consumed: ConsumedHostReviewToken | null;
    try {
      const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
      consumed = await dependencies.consumeToken(tokenHash);
    } catch {
      return privateHostReviewNotFound();
    }
    if (!consumed || consumed.matchReportId !== id) return privateHostReviewNotFound();

    const response = hostReviewJson({ ok: true as const });
    dependencies.setSession(response, consumed);
    return response;
  };
}

const persistence = getMatchReportHostPersistence();

export const POST = createHostReviewSessionHandler({
  canonicalSiteOrigin: hostReviewSessionIsConfigured() ? getCanonicalSiteOrigin() : null,
  consumeToken: async (tokenHash) => persistence?.consumeToken(tokenHash) ?? null,
  setSession: setHostReviewSessionCookie,
});
