import { NextRequest, NextResponse } from "next/server";
import { getBugReportRuntime } from "@/lib/bug-reports/runtime";
import type { BugReportUploadService } from "@/lib/bug-reports/upload-service";
import type { BugReportAbuseProtection } from "@/lib/bug-reports/abuse-protection";
import {
  normalizeCanonicalSiteOrigin,
  parseBugReportFinalizationAdapterResult,
} from "@/lib/bug-reports/contracts";
import {
  requestUsesCanonicalOrigin,
  sensitiveJsonResponse,
} from "@/lib/bug-reports/http";
import type {
  BugReportErrorCode,
  BugReportErrorResponse,
  BugReportUploadFinalizationResponse,
} from "@/types/bug-report";

export const dynamic = "force-dynamic";

export interface BugReportUploadFinalizationDependencies {
  isEnabled: () => boolean;
  uploadService: BugReportUploadService | null;
  abuseProtection: BugReportAbuseProtection | null;
  canonicalSiteOrigin: string | null;
}

type RouteContext = { params: Promise<{ uploadId: string }> };

export function createBugReportUploadFinalizationHandler(
  dependencies: BugReportUploadFinalizationDependencies,
) {
  return async function POST(
    request: NextRequest,
    context: RouteContext,
  ): Promise<NextResponse<BugReportUploadFinalizationResponse>> {
    if (!dependencies.isEnabled() || !dependencies.uploadService) {
      return errorResponse(
        503,
        "upload_unavailable",
        "Private image finalization is not available yet. No image was attached.",
      );
    }
    if (!dependencies.abuseProtection) {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "Secure finalization limits are not available. No image was attached.",
      );
    }
    const canonicalSiteOrigin = normalizeCanonicalSiteOrigin(dependencies.canonicalSiteOrigin);
    if (!canonicalSiteOrigin) {
      return errorResponse(
        503,
        "upload_unavailable",
        "Private finalization configuration is unavailable. No image was attached.",
      );
    }
    if (!requestUsesCanonicalOrigin(request, canonicalSiteOrigin)) {
      return errorResponse(400, "invalid_request", "The request host is not allowed.");
    }

    let attemptDecision;
    try {
      attemptDecision = await dependencies.abuseProtection.checkAttempt({
        request,
        action: "upload_finalization",
      });
    } catch {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "Secure finalization limits could not be verified. No image was attached.",
      );
    }
    if (!attemptDecision.allowed) {
      return errorResponse(
        429,
        "rate_limited",
        "Too many finalization attempts were made. Please wait before trying again.",
        attemptDecision.retryAfterSeconds,
      );
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return errorResponse(415, "invalid_request", "Submit finalization data as JSON.");
    }

    const { uploadId } = await context.params;
    if (!/^[A-Za-z0-9_-]{16,160}$/.test(uploadId)) {
      return errorResponse(400, "invalid_request", "The upload identifier is invalid.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "invalid_request", "The finalization data could not be read.");
    }
    const finalizationToken =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).finalizationToken
        : undefined;
    if (
      typeof finalizationToken !== "string" ||
      finalizationToken.length < 32 ||
      finalizationToken.length > 512
    ) {
      return errorResponse(400, "invalid_request", "The finalization token is invalid.");
    }

    let abuseDecision;
    try {
      abuseDecision = await dependencies.abuseProtection.consumeAction({
        attemptDecisionId: attemptDecision.decisionId,
        action: "upload_finalization",
        reporter: { kind: "anonymous" },
      });
    } catch {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "The finalization allowance could not be consumed. No image was attached.",
      );
    }
    if (!abuseDecision.allowed) {
      return errorResponse(
        429,
        "rate_limited",
        "Too many finalization attempts were made. Please wait before trying again.",
        abuseDecision.retryAfterSeconds,
      );
    }

    try {
      const adapterResult = await dependencies.uploadService.finalizeUpload({
        uploadId,
        finalizationToken,
        abuseDecisionId: abuseDecision.decisionId,
      });
      const finalized = parseBugReportFinalizationAdapterResult(adapterResult);
      if (!finalized.success) throw new Error(finalized.message);
      return sensitiveJsonResponse({ ok: true as const, attachment: finalized.data });
    } catch {
      return errorResponse(
        400,
        "upload_failed",
        "The uploaded image did not pass private validation and was not attached.",
      );
    }
  };
}

function errorResponse(
  status: number,
  code: BugReportErrorCode,
  message: string,
  retryAfterSeconds?: number,
): NextResponse<BugReportErrorResponse> {
  return sensitiveJsonResponse(
    {
      ok: false as const,
      code,
      message,
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    },
    {
      status,
      ...(retryAfterSeconds ? { headers: { "Retry-After": String(retryAfterSeconds) } } : {}),
    },
  );
}

const runtime = getBugReportRuntime();

export const POST = createBugReportUploadFinalizationHandler({
  isEnabled: () => runtime.ready,
  uploadService: runtime.uploadService,
  abuseProtection: runtime.abuseProtection,
  canonicalSiteOrigin: runtime.configuration?.canonicalSiteOrigin ?? null,
});
