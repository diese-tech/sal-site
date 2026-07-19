import { NextRequest, NextResponse } from "next/server";
import { parseBugReportAttachmentMetadata } from "@/lib/bug-reports/contracts";
import type { BugReportAbuseProtection } from "@/lib/bug-reports/abuse-protection";
import { getBugReportRuntime } from "@/lib/bug-reports/runtime";
import type { BugReportUploadService } from "@/lib/bug-reports/upload-service";
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
      abuseDecision = await dependencies.abuseProtection.checkSubmission({
        request,
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
      const uploadSession = await dependencies.uploadService.createSession({
        files: parsed.data,
        abuseDecisionId: abuseDecision.decisionId,
      });
      return NextResponse.json({ ok: true, uploadSession }, { status: 201 });
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
  return NextResponse.json(
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
});
