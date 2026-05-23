import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { consumeCaptainToken } from "@/lib/draft-data";

const COOKIE_NAME = "sal_captain_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days — matches token expiry

export interface CaptainSession {
  draftRoomId: string;
  orgId: string;
}

export function setCaptainCookie(response: Response & { cookies: { set: Function } }, session: CaptainSession) {
  const value = `${session.draftRoomId}:${session.orgId}`;
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
  const [draftRoomId, orgId] = value.split(":");
  if (!draftRoomId || !orgId) return null;
  return { draftRoomId, orgId };
}

export function getCaptainSessionFromRequest(request: NextRequest): CaptainSession | null {
  const value = request.cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const [draftRoomId, orgId] = value.split(":");
  if (!draftRoomId || !orgId) return null;
  return { draftRoomId, orgId };
}

/** Exchange a one-time captain token for a session. Returns the session or null on invalid/expired token. */
export async function exchangeToken(token: string): Promise<CaptainSession | null> {
  return consumeCaptainToken(token);
}
