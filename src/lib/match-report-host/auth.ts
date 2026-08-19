import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const HOST_REVIEW_COOKIE_NAME = "sal_match_report_host_session";
export const HOST_REVIEW_SESSION_MAX_AGE_SECONDS = 6 * 60 * 60;

export interface HostReviewSession {
  matchReportId: string;
  hostDiscordId: string;
  expiresAt: number;
}

type CookieResponse = Response & {
  cookies: {
    set: (
      name: string,
      value: string,
      options: {
        httpOnly: boolean;
        sameSite: "strict";
        secure: boolean;
        path: string;
        maxAge: number;
      },
    ) => void;
  };
};

function sessionSecret(): string {
  const value = process.env.MATCH_REPORT_HOST_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("MATCH_REPORT_HOST_SESSION_SECRET must be at least 32 characters.");
  }
  return value;
}

export function hostReviewSessionIsConfigured() {
  return (process.env.MATCH_REPORT_HOST_SESSION_SECRET?.length ?? 0) >= 32;
}

function signPayload(payload: Omit<HostReviewSession, "expiresAt"> & { expiresAt: number }) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyCookie(value: string): HostReviewSession | null {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const encoded = value.slice(0, separator);
  const actual = value.slice(separator + 1);
  const expected = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<HostReviewSession>;
    if (
      typeof parsed.matchReportId !== "string" ||
      typeof parsed.hostDiscordId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return parsed as HostReviewSession;
  } catch {
    return null;
  }
}

export function setHostReviewSessionCookie(
  response: CookieResponse,
  session: Omit<HostReviewSession, "expiresAt">,
) {
  const expiresAt = Date.now() + HOST_REVIEW_SESSION_MAX_AGE_SECONDS * 1000;
  response.cookies.set(
    HOST_REVIEW_COOKIE_NAME,
    signPayload({ ...session, expiresAt }),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE !== "1",
      path: `/api/match-reports/${session.matchReportId}`,
      maxAge: HOST_REVIEW_SESSION_MAX_AGE_SECONDS,
    },
  );
}

export function getHostReviewSessionFromRequest(
  request: NextRequest,
  expectedReportId: string,
): HostReviewSession | null {
  if (!hostReviewSessionIsConfigured()) return null;
  const value = request.cookies.get(HOST_REVIEW_COOKIE_NAME)?.value;
  if (!value) return null;
  const session = verifyCookie(value);
  if (!session || session.matchReportId !== expectedReportId) return null;
  return session;
}
