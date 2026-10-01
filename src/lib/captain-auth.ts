import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { redeemDraftAccess } from "@/lib/draft-data";

const COOKIE_NAME = "sal_captain_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days — matches access code expiry

/**
 * Cap on simultaneously held seats. Keeps the cookie small while comfortably
 * covering an admin or multi-team owner holding every seat in a division.
 * When exceeded the oldest seat is dropped.
 */
const MAX_SEATS = 8;

function captainSecret(): string {
  const s = process.env.CAPTAIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("CAPTAIN_SESSION_SECRET or ADMIN_SESSION_SECRET must be set.");
  return s;
}

export interface CaptainSession {
  draftRoomId: string;
  orgId: string;
}

/** Draft room id → org id for every seat this browser holds. */
export type CaptainSeats = Record<string, string>;

function sign(encoded: string): string {
  return createHmac("sha256", captainSecret()).update(encoded).digest("hex");
}

/**
 * Serialize the seat map into a signed cookie value.
 *
 * v2 payload is a JSON seat map. The previous format was a single
 * `roomId|orgId` pair, which meant a browser could hold exactly one seat:
 * joining a second room silently evicted the first, and two captains sharing a
 * machine kept logging each other out. verifyCaptainCookie still reads v1
 * cookies so sessions issued before this change survive.
 */
export function signCaptainCookie(seats: CaptainSeats): string {
  const entries = Object.entries(seats).filter(([roomId, orgId]) => roomId && orgId);
  const trimmed = entries.slice(Math.max(0, entries.length - MAX_SEATS));
  const encoded = Buffer.from(JSON.stringify({ v: 2, seats: Object.fromEntries(trimmed) })).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function parsePayload(decoded: string): CaptainSeats | null {
  // v1: "draftRoomId|orgId"
  if (!decoded.startsWith("{")) {
    const pipeIndex = decoded.indexOf("|");
    if (pipeIndex === -1) return null;
    const draftRoomId = decoded.slice(0, pipeIndex);
    const orgId = decoded.slice(pipeIndex + 1);
    if (!draftRoomId || !orgId) return null;
    return { [draftRoomId]: orgId };
  }

  // v2: {"v":2,"seats":{roomId: orgId}}
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const rawSeats = (parsed as { seats?: unknown }).seats;
  if (typeof rawSeats !== "object" || rawSeats === null) return null;

  const seats: CaptainSeats = {};
  for (const [roomId, orgId] of Object.entries(rawSeats as Record<string, unknown>)) {
    if (roomId && typeof orgId === "string" && orgId) seats[roomId] = orgId;
  }
  return Object.keys(seats).length > 0 ? seats : null;
}

export function verifyCaptainCookie(value: string): CaptainSeats | null {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return null;
  const encoded = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  return parsePayload(Buffer.from(encoded, "base64url").toString("utf8"));
}

type CaptainCookieOptions = {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

type CookieWritableResponse = Response & {
  cookies: { set: (name: string, value: string, options: CaptainCookieOptions) => void };
};

function writeSeatCookie(response: CookieWritableResponse, seats: CaptainSeats) {
  response.cookies.set(COOKIE_NAME, signCaptainCookie(seats), {
    httpOnly: true,
    sameSite: "lax",
    // E2E_TEST_MODE: the Playwright suite runs the production build over plain
    // http, where Secure cookies are dropped. Never set on real deployments.
    secure: process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE !== "1",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Add a seat to whatever this browser already holds and write the cookie.
 * Re-joining a room the browser already holds replaces that seat in place.
 */
export function grantCaptainSeat(
  response: CookieWritableResponse,
  currentSeats: CaptainSeats,
  session: CaptainSession,
) {
  const seats: CaptainSeats = { ...currentSeats };
  // Delete first so a re-join moves the seat to the end of the eviction queue.
  delete seats[session.draftRoomId];
  seats[session.draftRoomId] = session.orgId;
  writeSeatCookie(response, seats);
}

/** Drop one room's seat, leaving other rooms untouched. */
export function revokeCaptainSeat(
  response: CookieWritableResponse,
  currentSeats: CaptainSeats,
  draftRoomId: string,
) {
  const seats: CaptainSeats = { ...currentSeats };
  delete seats[draftRoomId];
  writeSeatCookie(response, seats);
}

export function getCaptainSeatsFromRequest(request: NextRequest): CaptainSeats {
  const value = request.cookies.get(COOKIE_NAME)?.value;
  if (!value) return {};
  return verifyCaptainCookie(value) ?? {};
}

export async function getCaptainSeats(): Promise<CaptainSeats> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return {};
  return verifyCaptainCookie(value) ?? {};
}

/** The seat this browser holds in `draftRoomId`, or null. */
export async function getCaptainSession(draftRoomId: string): Promise<CaptainSession | null> {
  const orgId = (await getCaptainSeats())[draftRoomId];
  return orgId ? { draftRoomId, orgId } : null;
}

export function getCaptainSessionFromRequest(request: NextRequest, draftRoomId: string): CaptainSession | null {
  const orgId = getCaptainSeatsFromRequest(request)[draftRoomId];
  return orgId ? { draftRoomId, orgId } : null;
}

/**
 * Exchange a team access code (or a legacy one-time link token) for a seat.
 * Returns the seat it grants, or null when the code is unknown or expired.
 */
export async function exchangeToken(code: string): Promise<CaptainSession | null> {
  return redeemDraftAccess(code);
}
