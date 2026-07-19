import { NextRequest, NextResponse } from "next/server";
import { getBugReportRuntime } from "@/lib/bug-reports/runtime";
import type { BugReportUploadService } from "@/lib/bug-reports/upload-service";
import type {
  BugReportErrorCode,
  BugReportErrorResponse,
  BugReportUploadFinalizationResponse,
} from "@/types/bug-report";

export const dynamic = "force-dynamic";

export interface BugReportUploadFinalizationDependencies {
  isEnabled: () => boolean;
  uploadService: BugReportUploadService | null;
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

    try {
      const attachment = await dependencies.uploadService.finalizeUpload({
        uploadId,
        finalizationToken,
      });
      return NextResponse.json({ ok: true, attachment });
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
): NextResponse<BugReportErrorResponse> {
  return NextResponse.json({ ok: false, code, message }, { status });
}

const runtime = getBugReportRuntime();

export const POST = createBugReportUploadFinalizationHandler({
  isEnabled: () => runtime.ready,
  uploadService: runtime.uploadService,
});
