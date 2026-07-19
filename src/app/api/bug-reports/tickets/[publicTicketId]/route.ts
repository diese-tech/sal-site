import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getDiscordId } from "@/lib/supabase-auth-server";
import {
  normalizeCanonicalSiteOrigin,
  parseAnonymousBugReportAccessToken,
  parseBugReportStatusResult,
  parsePublicBugReportTicketId,
} from "@/lib/bug-reports/contracts";
import {
  requestUsesCanonicalOrigin,
  sensitiveJsonResponse,
} from "@/lib/bug-reports/http";
import type {
  BugReportReporterContext,
  BugReportStatusAccess,
  BugReportStatusReader,
} from "@/lib/bug-reports/persistence";
import { getBugReportRuntime } from "@/lib/bug-reports/runtime";
import type {
  BugReportErrorResponse,
  BugReportStatusLookupResponse,
} from "@/types/bug-report";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ publicTicketId: string }> };

export interface BugReportStatusDependencies {
  statusReader: BugReportStatusReader | null;
  canonicalSiteOrigin: string | null;
  resolveReporter: (request: NextRequest) => Promise<BugReportReporterContext>;
}

export function createBugReportStatusHandler(dependencies: BugReportStatusDependencies) {
  return async function POST(
    request: NextRequest,
    context: RouteContext,
  ): Promise<NextResponse<BugReportStatusLookupResponse>> {
    if (!dependencies.statusReader) {
      return statusError(
        503,
        "persistence_unavailable",
        "Private ticket status is temporarily unavailable.",
      );
    }

    const canonicalSiteOrigin = normalizeCanonicalSiteOrigin(dependencies.canonicalSiteOrigin);
    if (!canonicalSiteOrigin || !requestUsesCanonicalOrigin(request, canonicalSiteOrigin)) {
      return statusError(400, "invalid_request", "The request host is not allowed.");
    }

    const { publicTicketId: rawPublicTicketId } = await context.params;
    const publicTicketId = parsePublicBugReportTicketId(rawPublicTicketId);
    if (!publicTicketId) return privateNotFound();

    const body = await readStatusRequest(request);
    if (!body.success) return body.response;

    let access: BugReportStatusAccess;
    if (body.accessToken !== undefined) {
      const accessToken = parseAnonymousBugReportAccessToken(body.accessToken);
      if (!accessToken) return privateNotFound();
      access = { kind: "anonymous", accessToken };
    } else {
      let reporter: BugReportReporterContext;
      try {
        reporter = await dependencies.resolveReporter(request);
      } catch {
        return statusError(
          503,
          "persistence_unavailable",
          "Private ticket status is temporarily unavailable.",
        );
      }
      if (reporter.kind !== "signed_in") return privateNotFound();
      access = {
        kind: "signed_in",
        authUserId: reporter.authUserId,
        discordId: reporter.discordId,
      };
    }

    let adapterResult: unknown;
    try {
      adapterResult = await dependencies.statusReader.read({ publicTicketId, access });
    } catch {
      return statusError(
        503,
        "persistence_unavailable",
        "Private ticket status is temporarily unavailable.",
      );
    }

    if (adapterResult === null) return privateNotFound();
    const parsed = parseBugReportStatusResult(adapterResult);
    if (!parsed.success) {
      return statusError(
        503,
        "persistence_unavailable",
        "Private ticket status is temporarily unavailable.",
      );
    }

    return sensitiveJsonResponse({ ok: true as const, ticket: parsed.data });
  };
}

async function readStatusRequest(request: NextRequest): Promise<
  | { success: true; accessToken?: unknown }
  | { success: false; response: NextResponse<BugReportErrorResponse> }
> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { success: false, response: privateNotFound() };
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 8 * 1024) {
    return { success: false, response: privateNotFound() };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { success: false, response: privateNotFound() };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, response: privateNotFound() };
  }
  const candidate = body as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => key !== "accessToken")) {
    return { success: false, response: privateNotFound() };
  }
  return {
    success: true,
    ...(Object.prototype.hasOwnProperty.call(candidate, "accessToken")
      ? { accessToken: candidate.accessToken }
      : {}),
  };
}

function privateNotFound(): NextResponse<BugReportErrorResponse> {
  return statusError(
    404,
    "invalid_request",
    "This private ticket could not be opened with the supplied access.",
  );
}

function statusError(
  status: number,
  code: BugReportErrorResponse["code"],
  message: string,
): NextResponse<BugReportErrorResponse> {
  return sensitiveJsonResponse({ ok: false, code, message }, { status });
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

export const POST = createBugReportStatusHandler({
  statusReader: runtime.statusReader,
  canonicalSiteOrigin: runtime.configuration?.canonicalSiteOrigin ?? null,
  resolveReporter,
});
