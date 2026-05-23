import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { consumeCaptainToken } from "@/lib/draft-data";

const COOKIE_NAME = "sal_captain_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days — matches token expiry

function captainSecret(): string {
  const s = process.env.CAPTAIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("CAPTAIN_SESSION_SECRET or ADMIN_SESSION_SECRET must be set.");
  return s;
}

export interface CaptainSession {
  draftRoomId: string;
  orgId: string;
}

function signCaptainCookie(draftRoomId: string, orgId: string): string {
  const encoded = Buffer.from(`${draftRoomId}|${orgId}`).toString("base64url");
  const signature = createHmac("sha256", captainSecret()).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

function verifyCaptainCookie(value: string): CaptainSession | null {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return null;
  const encoded = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", captainSecret()).update(encoded).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  const pipeIndex = decoded.indexOf("|");
  if (pipeIndex === -1) return null;
  const draftRoomId = decoded.slice(0, pipeIndex);
  const orgId = decoded.slice(pipeIndex + 1);
  if (!draftRoomId || !orgId) return null;
  return { draftRoomId, orgId };
}

export function setCaptainCookie(response: Response & { cookies: { set: Function } }, session: CaptainSession) {
  const value = signCaptainCookie(session.draftRoomId, session.orgId);
  response.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getCaptainSession(): Promise<CaptainSession | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;
  return verifyCaptainCookie(value);
}

export function getCaptainSessionFromRequest(request: NextRequest): CaptainSession | null {
  const value = request.cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;
  return verifyCaptainCookie(value);
}

/** Exchange a one-time captain token for a session. Returns the session or null on invalid/expired token. */
export async function exchangeToken(token: string): Promise<CaptainSession | null> {
  return consumeCaptainToken(token);
}
