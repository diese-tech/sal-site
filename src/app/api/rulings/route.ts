import { NextRequest, NextResponse } from "next/server";
import { RULING_REQUEST_API_VERSION, type RulingRequestResponse } from "@/types/ruling-request";
import {
  assertRulingRequestResponse,
  buildRulingRequestUnavailableResponse,
  parseOfficialRulingRequest,
  parseRulingRequestHeaders,
} from "@/lib/rulings/contracts";
import { getRulingRequestRuntime } from "@/lib/rulings/runtime";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: RulingRequestResponse, status: number) {
  return NextResponse.json(assertRulingRequestResponse(body), { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const runtime = getRulingRequestRuntime();
  if (!runtime) return json(buildRulingRequestUnavailableResponse(), 503);

  const requester = await runtime.getSignedInRequester(request);
  if (!requester) {
    return json(
      {
        ok: false,
        apiVersion: RULING_REQUEST_API_VERSION,
        kind: "ruling_request_error",
        code: "SIGN_IN_REQUIRED",
        message: "Sign in with Discord before requesting a binding SAL ruling.",
      },
      401,
    );
  }

  const parsedHeaders = parseRulingRequestHeaders(request.headers);
  if (!parsedHeaders.success) {
    return json(
      {
        ok: false,
        apiVersion: RULING_REQUEST_API_VERSION,
        kind: "ruling_request_error",
        code: "INVALID_REQUEST",
        message: "A CSRF token and Idempotency-Key are required.",
        fieldErrors: parsedHeaders.error.flatten().fieldErrors,
      },
      400,
    );
  }

  const csrfValid = await runtime.verifyCsrfToken(requester, parsedHeaders.data.csrfToken);
  if (!csrfValid) {
    return json(
      {
        ok: false,
        apiVersion: RULING_REQUEST_API_VERSION,
        kind: "ruling_request_error",
        code: "INVALID_CSRF_TOKEN",
        message: "Refresh the page before submitting this ruling request.",
      },
      403,
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = parseOfficialRulingRequest(body);
  if (!parsedBody.success) {
    return json(
      {
        ok: false,
        apiVersion: RULING_REQUEST_API_VERSION,
        kind: "ruling_request_error",
        code: "INVALID_REQUEST",
        message: "Complete every required binding-case fact and confirm the current notice.",
        fieldErrors: parsedBody.error.flatten().fieldErrors,
      },
      400,
    );
  }

  const ticket = await runtime.createTicket({
    requester,
    request: parsedBody.data,
    idempotencyKey: parsedHeaders.data.idempotencyKey,
  });
  return json(ticket, 201);
}
