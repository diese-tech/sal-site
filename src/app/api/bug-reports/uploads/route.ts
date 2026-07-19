import { NextRequest, NextResponse } from "next/server";
import {
  normalizeAllowedUploadHosts,
  normalizeCanonicalSiteOrigin,
  parseBugReportAttachmentMetadata,
  parseBugReportUploadSessionAdapterResult,
} from "@/lib/bug-reports/contracts";
import type { BugReportAbuseProtection } from "@/lib/bug-reports/abuse-protection";
import { getBugReportRuntime } from "@/lib/bug-reports/runtime";
import type { BugReportUploadService } from "@/lib/bug-reports/upload-service";
import {
  requestUsesCanonicalOrigin,
  sensitiveJsonResponse,
} from "@/lib/bug-reports/http";
import type {
  BugReportErrorCode,
  BugReportErrorResponse,
  BugReportUploadSessionResponse,
} from "@/types/bug-report";

export const dynamic = "force-dynamic";

export interface BugReportUploadSessionDependencies {
  isEnabled: () => boolean;
  abuseProtection: BugReportAbuseProtection | null;
  uploadService: BugReportUploadService | null;
  canonicalSiteOrigin: string | null;
  allowedUploadHosts: readonly string[] | null;
  now: () => Date;
}

export function createBugReportUploadSessionHandler(
  dependencies: BugReportUploadSessionDependencies,
) {
  return async function POST(
    request: NextRequest,
  ): Promise<NextResponse<BugReportUploadSessionResponse>> {
    if (!dependencies.isEnabled() || !dependencies.uploadService) {
      return errorResponse(
        503,
        "upload_unavailable",
        "Private image upload storage is not available yet. No files were uploaded.",
      );
    }
    if (!dependencies.abuseProtection) {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "Secure upload limits are not available yet. No files were uploaded.",
      );
    }

    const canonicalSiteOrigin = normalizeCanonicalSiteOrigin(dependencies.canonicalSiteOrigin);
    const allowedUploadHosts = normalizeAllowedUploadHosts(dependencies.allowedUploadHosts);
    if (!canonicalSiteOrigin || !allowedUploadHosts) {
      return errorResponse(
        503,
        "upload_unavailable",
        "Private upload configuration is unavailable. No files were uploaded.",
      );
    }
    if (!requestUsesCanonicalOrigin(request, canonicalSiteOrigin)) {
      return errorResponse(400, "invalid_request", "The request host is not allowed.");
    }

    let attemptDecision;
    try {
      attemptDecision = await dependencies.abuseProtection.checkAttempt({
        request,
        action: "upload_session",
      });
    } catch {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "Secure upload limits could not be verified. No files were uploaded.",
      );
    }
    if (!attemptDecision.allowed) {
      return errorResponse(
        429,
        "rate_limited",
        "Too many upload attempts were made. Please wait before trying again.",
        attemptDecision.retryAfterSeconds,
      );
    }

    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return errorResponse(415, "invalid_request", "Submit upload metadata as JSON.");
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
      return errorResponse(413, "invalid_request", "The upload metadata is too large.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "invalid_request", "The upload metadata could not be read.");
    }
    const files =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).files
        : undefined;
    const parsed = parseBugReportAttachmentMetadata(files);
    if (!parsed.success) return errorResponse(400, parsed.code, parsed.message);

    let abuseDecision;
    try {
      abuseDecision = await dependencies.abuseProtection.consumeAction({
        attemptDecisionId: attemptDecision.decisionId,
        reporter: { kind: "anonymous" },
        action: "upload_session",
      });
    } catch {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "Secure upload limits could not be verified. No files were uploaded.",
      );
    }
    if (!abuseDecision.allowed) {
      return errorResponse(
        429,
        "rate_limited",
        "Too many upload sessions were requested. Please wait before trying again.",
        abuseDecision.retryAfterSeconds,
      );
    }

    try {
      const adapterResult = await dependencies.uploadService.createSession({
        files: parsed.data,
        abuseDecisionId: abuseDecision.decisionId,
      });
      const uploadSessionResult = parseBugReportUploadSessionAdapterResult(
        adapterResult,
        parsed.data.length,
        dependencies.now(),
      );
      if (!uploadSessionResult.success) throw new Error(uploadSessionResult.message);

      const targetHosts = uploadSessionResult.data.targets.map((target, index) => {
        const url = new URL(target.uploadUrl);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          !allowedUploadHosts.includes(url.host.toLowerCase()) ||
          target.requiredHeaders["content-type"] !== parsed.data[index].mediaType
        ) {
          throw new Error("Unsafe upload target");
        }
        return url.host.toLowerCase();
      });
      const uploadSession = {
        ...uploadSessionResult.data,
        allowedUploadHosts: [...new Set(targetHosts)],
      };
      return sensitiveJsonResponse({ ok: true as const, uploadSession }, { status: 201 });
    } catch {
      return errorResponse(
        503,
        "upload_failed",
        "Private upload targets could not be created. No files were uploaded.",
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
      ok: false,
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

export const POST = createBugReportUploadSessionHandler({
  isEnabled: () => runtime.ready,
  abuseProtection: runtime.abuseProtection,
  uploadService: runtime.uploadService,
  canonicalSiteOrigin: runtime.configuration?.canonicalSiteOrigin ?? null,
  allowedUploadHosts: runtime.configuration?.allowedUploadHosts ?? null,
  now: () => new Date(),
});
