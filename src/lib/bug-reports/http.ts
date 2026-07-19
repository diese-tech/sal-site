import { NextRequest, NextResponse } from "next/server";

export const BUG_REPORT_SENSITIVE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
} as const;

export function sensitiveJsonResponse<T>(
  body: T,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse<T> {
  return NextResponse.json(body, {
    status: init.status,
    headers: {
      ...BUG_REPORT_SENSITIVE_RESPONSE_HEADERS,
      ...init.headers,
    },
  });
}

export function requestUsesCanonicalOrigin(
  request: NextRequest,
  canonicalSiteOrigin: string,
): boolean {
  try {
    if (new URL(request.url).origin !== canonicalSiteOrigin) return false;
    const browserOrigin = request.headers.get("origin");
    return !browserOrigin || new URL(browserOrigin).origin === canonicalSiteOrigin;
  } catch {
    return false;
  }
}
