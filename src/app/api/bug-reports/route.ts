import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getDiscordId } from "@/lib/supabase-auth-server";
import {
  normalizeCanonicalSiteOrigin,
  parseBugReportAttachmentReferences,
  parseBugReportPayload,
  parsePersistedBugReportResult,
} from "@/lib/bug-reports/contracts";
import type {
  BugReportPersistence,
  BugReportReporterContext,
  PersistedBugReportResult,
} from "@/lib/bug-reports/persistence";
import {
  type BugReportAbuseProtection,
} from "@/lib/bug-reports/abuse-protection";
import { getBugReportRuntime } from "@/lib/bug-reports/runtime";
import {
  requestUsesCanonicalOrigin,
  sensitiveJsonResponse,
} from "@/lib/bug-reports/http";
import type {
  BugReportErrorCode,
  BugReportErrorResponse,
  BugReportSubmissionPayload,
  BugReportSubmissionReceipt,
  BugReportSubmissionResponse,
} from "@/types/bug-report";

export const dynamic = "force-dynamic";

export interface BugReportPostDependencies {
  isEnabled: () => boolean;
  persistence: BugReportPersistence | null;
  abuseProtection: BugReportAbuseProtection | null;
  canonicalSiteOrigin: string | null;
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

    const canonicalSiteOrigin = normalizeCanonicalSiteOrigin(dependencies.canonicalSiteOrigin);
    if (!canonicalSiteOrigin) {
      return errorResponse(
        503,
        "persistence_unavailable",
        "Canonical ticket links are not configured. No report was submitted.",
      );
    }
    if (!requestUsesCanonicalOrigin(request, canonicalSiteOrigin)) {
      return errorResponse(400, "invalid_request", "The request host is not allowed.");
    }

    let attemptDecision;
    try {
      attemptDecision = await dependencies.abuseProtection.checkAttempt({
        request,
        action: "ticket_submission",
      });
    } catch {
      return errorResponse(
        503,
        "rate_limit_unavailable",
        "Secure submission limits could not be verified. No report was submitted.",
      );
    }
    if (!attemptDecision.allowed) {
      return errorResponse(
        429,
        "rate_limited",
        "Too many reports were attempted. Please wait before trying again.",
        undefined,
        attemptDecision.retryAfterSeconds,
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

    const attachmentResult = parseBugReportAttachmentReferences(parsedRequest.attachments);
    if (!attachmentResult.success) {
      return errorResponse(400, attachmentResult.code, attachmentResult.message, {
        attachments: attachmentResult.message,
      });
    }

    let reporter: BugReportReporterContext = { kind: "anonymous" };
    if (payloadResult.data.replyRelayConsent) {
      reporter = await dependencies.resolveReporter(request);
      if (reporter.kind !== "signed_in" || !reporter.discordId) {
        return errorResponse(
          400,
          "invalid_request",
          "Sign in with Discord before requesting private reply relay.",
          { replyRelayConsent: "A linked Discord identity is required for private replies." },
        );
      }
    }

    let abuseDecision;
    try {
      abuseDecision = await dependencies.abuseProtection.consumeAction({
        attemptDecisionId: attemptDecision.decisionId,
        reporter,
        action: "ticket_submission",
      });
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
      const adapterResult = await dependencies.persistence.persist({
        payload: payloadResult.data,
        attachments: attachmentResult.data,
        reporter,
        abuseDecisionId: abuseDecision.decisionId,
      });
      const persisted = parsePersistedBugReportResult(
        adapterResult,
        reporter,
        payloadResult.data.replyRelayConsent,
      );
      if (!persisted.success) throw new Error(persisted.message);
      return sensitiveJsonResponse(
        {
          ok: true as const,
          ticket: buildPublicBugReportReceipt(persisted.data, canonicalSiteOrigin),
        },
        { status: 201 },
      );
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
  | { success: true; payload: unknown; attachments: unknown }
  | { success: false; response: NextResponse<BugReportErrorResponse> }
> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return {
      success: false,
      response: errorResponse(
        415,
        "invalid_request",
        "Submit the report as JSON using finalized upload references.",
      ),
    };
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    return {
      success: false,
      response: errorResponse(413, "invalid_request", "The report body is too large."),
    };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: errorResponse(400, "invalid_request", "The report body could not be read."),
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      success: false,
      response: errorResponse(400, "invalid_request", "The report body is invalid."),
    };
  }

  const candidate = body as Record<string, unknown>;
  if (!("payload" in candidate) || !("attachments" in candidate)) {
    return {
      success: false,
      response: errorResponse(400, "invalid_request", "The payload and attachments are required."),
    };
  }

  return { success: true, payload: candidate.payload, attachments: candidate.attachments };
}

export function buildPublicBugReportReceipt(
  persisted: PersistedBugReportResult,
  siteOrigin: string,
): BugReportSubmissionReceipt {
  const statusUrl = new URL(
    `/report-a-bug/tickets/${encodeURIComponent(persisted.publicTicketId)}`,
    siteOrigin,
  ).toString();

  return {
    ticketId: persisted.ticketId,
    status: persisted.status,
    reporterAccess:
      persisted.reporterAccess.kind === "anonymous"
        ? {
            kind: "anonymous",
            accessUrl: `${statusUrl}#access=${encodeURIComponent(
              persisted.reporterAccess.oneTimeAccessToken,
            )}`,
            recoveryCode: persisted.reporterAccess.recoveryCode,
          }
        : {
            kind: "signed_in",
            accessUrl: statusUrl,
          },
    relay: persisted.relay,
  };
}

function errorResponse(
  status: number,
  code: BugReportErrorCode,
  message: string,
  fieldErrors?: Partial<Record<keyof BugReportSubmissionPayload | "attachments", string>>,
  retryAfterSeconds?: number,
): NextResponse<BugReportErrorResponse> {
  return sensitiveJsonResponse(
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
  isEnabled: () => runtime.ready,
  persistence: runtime.persistence,
  abuseProtection: runtime.abuseProtection,
  canonicalSiteOrigin: runtime.configuration?.canonicalSiteOrigin ?? null,
  resolveReporter,
});
