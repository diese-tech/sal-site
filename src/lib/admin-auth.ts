import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "sal_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("ADMIN_SESSION_SECRET must be set to sign admin sessions.");
  return s;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export interface AdminSessionPayload {
  discordId: string;
  role: "super_admin" | "admin";
  exp: number;
}

export function makeAdminSession(discordId: string, role: "super_admin" | "admin") {
  const payload = JSON.stringify({ discordId, role, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAdminSession(value?: string): AdminSessionPayload | null {
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      discordId?: unknown;
      role?: unknown;
      exp?: unknown;
    };
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (typeof payload.discordId !== "string") return null;
    if (payload.role !== "super_admin" && payload.role !== "admin") return null;
    return { discordId: payload.discordId, role: payload.role, exp: payload.exp };
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const store = await cookies();
  return verifyAdminSession(store.get(COOKIE_NAME)?.value);
}

export async function isAdminSession(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

export async function requireAdmin(): Promise<AdminSessionPayload> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export function getAdminRequestSession(request: NextRequest): AdminSessionPayload | null {
  return verifyAdminSession(request.cookies.get(COOKIE_NAME)?.value);
}

export function isAdminRequest(request: NextRequest): boolean {
  return getAdminRequestSession(request) !== null;
}

export function isSuperAdminRequest(request: NextRequest): boolean {
  const session = getAdminRequestSession(request);
  return session?.role === "super_admin";
}

/**
 * Server-to-server auth for lab-salbot calling back into this site's admin
 * API (e.g. to trigger a standings recalculation after a Discord-approved
 * match result). Deliberately separate from ADMIN_PASSWORD/admin sessions —
 * this credential isn't tied to a human admin identity and isn't affected by
 * retiring ADMIN_PASSWORD post-onboarding (see F-05/D-3).
 */
export function isInternalServiceRequest(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function adminCookie(discordId: string, role: "super_admin" | "admin") {
  return {
    name: COOKIE_NAME,
    value: makeAdminSession(discordId, role),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      // E2E_TEST_MODE: the Playwright suite runs the production build over plain
      // http, where Secure cookies are dropped. Never set on real deployments.
      secure: process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE !== "1",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

export function expiredAdminCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      // E2E_TEST_MODE: the Playwright suite runs the production build over plain
      // http, where Secure cookies are dropped. Never set on real deployments.
      secure: process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE !== "1",
      path: "/",
      maxAge: 0,
    },
  };
}
