import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getCanonicalSiteOrigin,
  hostReviewJson,
  requestUsesCanonicalOrigin,
} from "@/lib/match-report-host/http";
import { getMatchReportHostPersistence } from "@/lib/match-report-host/persistence";
import { hostReviewSessionIsConfigured } from "@/lib/match-report-host/auth";

export const dynamic = "force-dynamic";

const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const reportIdSchema = z.string().uuid();
const requestSchema = z.object({
  host_discord_id: z.string().min(1).max(64).regex(/^\d+$/),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

export interface IssueHostTokenDependencies {
  canonicalSiteOrigin: string | null;
  internalToken: string | null;
  generateToken: () => string;
  now: () => Date;
  issueToken: (input: {
    matchReportId: string;
    hostDiscordId: string;
    tokenHash: string;
    expiresAt: string;
  }) => Promise<void>;
}

function bearerMatches(request: NextRequest, expected: string | null) {
  if (!expected) return false;
  const actual = request.headers.get("authorization");
  const expectedHeader = `Bearer ${expected}`;
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expectedHeader);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createIssueHostTokenHandler(dependencies: IssueHostTokenDependencies) {
  return async function POST(request: NextRequest, context: RouteContext) {
    if (
      !dependencies.canonicalSiteOrigin ||
      !requestUsesCanonicalOrigin(request, dependencies.canonicalSiteOrigin) ||
      !bearerMatches(request, dependencies.internalToken)
    ) {
      return hostReviewJson({ error: "Unauthorized." }, 401);
    }

    const { id } = await context.params;
    if (!reportIdSchema.safeParse(id).success) {
      return hostReviewJson({ error: "Invalid report id." }, 400);
    }
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return hostReviewJson({ error: "Invalid request." }, 400);

    const rawToken = dependencies.generateToken();
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(dependencies.now().getTime() + TOKEN_LIFETIME_MS).toISOString();
    try {
      await dependencies.issueToken({
        matchReportId: id,
        hostDiscordId: parsed.data.host_discord_id,
        tokenHash,
        expiresAt,
      });
    } catch {
      return hostReviewJson({ error: "Could not issue host review access." }, 503);
    }

    const reviewUrl = new URL(`/match-reports/${id}/review`, dependencies.canonicalSiteOrigin);
    reviewUrl.hash = `access=${rawToken}`;
    return hostReviewJson(
      { review_url: reviewUrl.toString(), expires_at: expiresAt },
      201,
    );
  };
}

const persistence = getMatchReportHostPersistence();

export const POST = createIssueHostTokenHandler({
  canonicalSiteOrigin: hostReviewSessionIsConfigured() ? getCanonicalSiteOrigin() : null,
  internalToken:
    process.env.SAL_SITE_INTERNAL_TOKEN?.trim() ||
    process.env.INTERNAL_SERVICE_TOKEN?.trim() ||
    null,
  generateToken: () => randomBytes(32).toString("base64url"),
  now: () => new Date(),
  issueToken: async (input) => {
    if (!persistence) throw new Error("Supabase not configured.");
    return persistence.issueToken(input);
  },
});
