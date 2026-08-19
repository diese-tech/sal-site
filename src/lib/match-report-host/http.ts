import { NextResponse } from "next/server";
import { requestUsesCanonicalOrigin, sensitiveJsonResponse } from "@/lib/bug-reports/http";

export { requestUsesCanonicalOrigin };

export function getCanonicalSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function hostReviewJson<T>(body: T, status = 200): NextResponse<T> {
  return sensitiveJsonResponse(body, { status });
}

export function privateHostReviewNotFound() {
  return hostReviewJson(
    { ok: false as const, error: "This private match report could not be opened." },
    404,
  );
}
