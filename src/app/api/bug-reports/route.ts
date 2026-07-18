import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getDiscordId } from "@/lib/supabase-auth-server";
import {
  describeBugReportAttachments,
  parseBugReportPayload,
  validateBugReportAttachments,
  type BugReportFile,
} from "@/lib/bug-reports/contracts";
import type { BugReportPersistence, BugReportReporterContext } from "@/lib/bug-reports/persistence";
import {
  type BugReportAbuseProtection,
} from "@/lib/bug-reports/abuse-protection";
import { getBugReportRuntime } from "@/lib/bug-reports/runtime";
import type {
  BugReportErrorCode,
  BugReportErrorResponse,
  BugReportSubmissionPayload,
  BugReportSubmissionResponse,
} from "@/types/bug-report";

export const dynamic = "force-dynamic";

export interface BugReportPostDependencies {
  isEnabled: () => boolean;
  persistence: BugReportPersistence | null;
  abuseProtection: BugReportAbuseProtection | null;
  resolveReporter: (request: NextRequest) => Promise<BugReportReporterContext>;
}

export function createBugReportPostHandler(dependencies: BugReportPostDependencies) {
  return async function POST(request: NextRequest): Promise<NextResponse<BugReportSubmissionResponse>> {
    if (!dependencies.isEnabled()) {
      return errorResponse(
        503,
        "disabled",
        "Bug report intake is not available yet. No report was submitted.",
      );
    }

    const parsedRequest = await readSubmissionRequest(request);
    if (!parsedRequest.success) return parsedRequest.response;

    const payloadResult = parseBugReportPayload(parsedRequest.payload);
    if (!payloadResult.success) {
      return errorResponse(
        400,
        "invalid_request",
        "Check the highlighted fields and try again.",
        payloadResult.fieldErrors,
      );
    }

    const attachmentResult = await validateBugReportAttachments(parsedRequest.attachments);
    if (!attachmentResult.success) {
      return errorResponse(400, attachmentResult.code, attachmentResult.message, {
        attachments: attachmentResult.message,
      });
    }

    const reporter = await dependencies.resolveReporter(request);
    if (payloadResult.data.replyRelayConsent && reporter.kind !== "signed_in") {
      return errorResponse(
        400,
        "invalid_request",
        "Sign in with Discord before requesting private reply relay.",
        { replyRelayConsent: "Discord sign-in is required for private replies." },
      );
    }

    if (!dependencies.persistence) {
      return errorResponse(
        503,
        "persistence_unavailable",
        "Secure ticket storage is not available yet. No report was submitted.",
      );
    }

    if (!dependencies.abuseProtection) {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "Secure submission limits are not available yet. No report was submitted.",
      );
    }

    let abuseDecision;
    try {
      abuseDecision = await dependencies.abuseProtection.checkSubmission({ request, reporter });
    } catch {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "Secure submission limits could not be verified. No report was submitted.",
      );
    }

    if (!abuseDecision.allowed) {
      return errorResponse(
        429,
        "rate_limited",
        "Too many reports were submitted. Please wait before trying again.",
        undefined,
        abuseDecision.retryAfterSeconds,
      );
    }

    try {
      const persistedReporter: BugReportReporterContext = payloadResult.data.replyRelayConsent
        ? reporter
        : { kind: "anonymous" };
      const ticket = await dependencies.persistence.persist({
        payload: payloadResult.data,
        attachments: parsedRequest.attachments,
        attachmentDescriptors: describeBugReportAttachments(parsedRequest.attachments),
        reporter: persistedReporter,
        abuseDecisionId: abuseDecision.decisionId,
      });
      return NextResponse.json({ ok: true, ticket }, { status: 201 });
    } catch {
      return errorResponse(
        503,
        "submission_failed",
        "We could not save this report. Nothing was submitted, so please try again.",
      );
    }
  };
}

async function readSubmissionRequest(request: NextRequest): Promise<
  | { success: true; payload: unknown; attachments: BugReportFile[] }
  | { success: false; response: NextResponse<BugReportErrorResponse> }
> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return {
      success: false,
      response: errorResponse(
        415,
        "invalid_request",
        "Submit the report as multipart form data.",
      ),
    };
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return {
      success: false,
      response: errorResponse(400, "invalid_request", "The report body could not be read."),
    };
  }

  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") {
    return {
      success: false,
      response: errorResponse(400, "invalid_request", "The report payload is required."),
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return {
      success: false,
      response: errorResponse(400, "invalid_request", "The report payload must be valid JSON."),
    };
  }

  const attachmentEntries = formData.getAll("attachments");
  if (attachmentEntries.some((entry) => typeof entry === "string" || !isBugReportFile(entry))) {
    return {
      success: false,
      response: errorResponse(400, "invalid_request", "Attachments must be image files.", {
        attachments: "Attachments must be image files.",
      }),
    };
  }

  return { success: true, payload, attachments: attachmentEntries as unknown as BugReportFile[] };
}

function isBugReportFile(value: FormDataEntryValue): value is File {
  return (
    typeof value !== "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.size === "number" &&
    typeof value.arrayBuffer === "function"
  );
}

function errorResponse(
  status: number,
  code: BugReportErrorCode,
  message: string,
  fieldErrors?: Partial<Record<keyof BugReportSubmissionPayload | "attachments", string>>,
  retryAfterSeconds?: number,
): NextResponse<BugReportErrorResponse> {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    },
    {
      status,
      ...(retryAfterSeconds ? { headers: { "Retry-After": String(retryAfterSeconds) } } : {}),
    },
  );
}

async function resolveReporter(): Promise<BugReportReporterContext> {
  const user = await getAuthUser();
  if (!user) return { kind: "anonymous" };
  return {
    kind: "signed_in",
    authUserId: user.id,
    discordId: getDiscordId(user),
  };
}

const runtime = getBugReportRuntime();

export const POST = createBugReportPostHandler({
  isEnabled: () => runtime.featureEnabled,
  persistence: runtime.persistence,
  abuseProtection: runtime.abuseProtection,
  resolveReporter,
});
