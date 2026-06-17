/**
 * Registration and claim flow tests (issue #88).
 *
 * Flow A: POST /api/auth/register — new player pending registration
 * Flow B: POST /api/auth/claim   — returning player claiming an existing profile
 *
 * All Supabase/auth calls are mocked so these run without a real DB connection.
 * E2E coverage against a live environment is handled by tests/e2e/site.spec.ts.
 *
 * Known limitation on concurrency tests (Flow B, last test): mocked calls both
 * "succeed" because there's no shared state. The actual DB-level race guard is
 * the unique constraint + RLS policy; verifying it requires a real Supabase
 * instance (see tests/integration/rls.test.ts).
 *
 * Username-based claim matching is inherently fragile after a Discord username
 * change — the player simply won't be found and will fall through to the normal
 * registration path. A future improvement would match on Discord ID first,
 * falling back to username only when the ID is absent from the players table.
 * TODO: Add Discord-ID-first matching to claimPlayerByDiscordUsername (#57 follow-up).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

// ── Mocks (hoisted before imports) ──────────────────────────────────────────

vi.mock("@/lib/supabase-auth-server", () => ({
  getAuthUser: vi.fn(),
  getDiscordId: vi.fn(),
  getDiscordUsername: vi.fn(),
  getDiscordDisplayName: vi.fn(),
}));

vi.mock("@/lib/league-data", () => ({
  createRegistration: vi.fn().mockResolvedValue(undefined),
  getRegistrationByDiscordId: vi.fn().mockResolvedValue(null),
  claimPlayerByDiscordUsername: vi.fn(),
  getPlayerByDiscordId: vi.fn().mockResolvedValue(null),
  updateRegistrationStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAt: Date.now() + 60_000 }),
  getRateLimitIdentifier: vi.fn().mockReturnValue("127.0.0.1"),
  retryAfterSeconds: vi.fn().mockReturnValue("60"),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

// ── Typed mock accessors ─────────────────────────────────────────────────────

import {
  getAuthUser,
  getDiscordId,
  getDiscordUsername,
} from "@/lib/supabase-auth-server";
import {
  createRegistration,
  getRegistrationByDiscordId,
  claimPlayerByDiscordUsername,
  getPlayerByDiscordId,
} from "@/lib/league-data";
import { checkRateLimit } from "@/lib/rate-limit";

const mockGetAuthUser = vi.mocked(getAuthUser);
const mockGetDiscordId = vi.mocked(getDiscordId);
const mockGetDiscordUsername = vi.mocked(getDiscordUsername);
const mockGetRegistrationByDiscordId = vi.mocked(getRegistrationByDiscordId);
const mockCreateRegistration = vi.mocked(createRegistration);
const mockClaimPlayer = vi.mocked(claimPlayerByDiscordUsername);
const mockGetPlayerByDiscordId = vi.mocked(getPlayerByDiscordId);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

// Minimal fake Discord user (only fields the mocked functions care about)
const FAKE_USER = { id: "supabase-uid-1" } as User;
const DISCORD_ID = "discord-123456";
const DISCORD_USERNAME = "testuser";

// ── Helpers ──────────────────────────────────────────────────────────────────

function registerRequest(body: unknown = { formData: { ign: "Hero" } }): NextRequest {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function claimRequest(): NextRequest {
  return new NextRequest("http://localhost/api/auth/claim", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
  });
}

// Seed the default happy-path auth mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue({ allowed: true, resetAt: Date.now() + 60_000 });
  mockGetAuthUser.mockResolvedValue(FAKE_USER);
  mockGetDiscordId.mockReturnValue(DISCORD_ID);
  mockGetDiscordUsername.mockReturnValue(DISCORD_USERNAME);
  mockGetRegistrationByDiscordId.mockResolvedValue(null);
  mockGetPlayerByDiscordId.mockResolvedValue(null);
});

// ── Flow A: POST /api/auth/register ─────────────────────────────────────────

describe("POST /api/auth/register — Flow A", () => {
  it("returns 401 when not signed in", async () => {
    mockGetAuthUser.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(registerRequest());
    expect(res.status).toBe(401);
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("returns 400 when Discord ID is missing from session", async () => {
    mockGetDiscordId.mockReturnValueOnce(null);

    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(registerRequest());
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, resetAt: Date.now() + 30_000 });

    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(registerRequest());
    expect(res.status).toBe(429);
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("returns 409 when a registration already exists for this Discord account", async () => {
    mockGetRegistrationByDiscordId.mockResolvedValueOnce({
      id: "reg-existing",
      discordId: DISCORD_ID,
      discordUsername: DISCORD_USERNAME,
      formData: {},
      status: "pending",
      createdAt: new Date().toISOString(),
    } as Awaited<ReturnType<typeof getRegistrationByDiscordId>>);

    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(registerRequest());
    const body = await res.json() as { error: string };
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/registration already exists/i);
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("returns 400 when body is malformed (not JSON)", async () => {
    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("returns 400 when formData is missing from body", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(registerRequest({ notFormData: "nope" }));
    expect(res.status).toBe(400);
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("creates a registration row and returns 200 on valid submission", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(registerRequest({ formData: { ign: "HeroPlayer", role: "Mid" } }));
    const body = await res.json() as { ok: boolean; id: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(mockCreateRegistration).toHaveBeenCalledOnce();
  });

  it("calls createRegistration exactly once — no duplicate rows on success", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    await POST(registerRequest({ formData: { ign: "UniquePlayer" } }));
    expect(mockCreateRegistration).toHaveBeenCalledTimes(1);
  });
});

// ── Flow B: POST /api/auth/claim ─────────────────────────────────────────────

describe("POST /api/auth/claim — Flow B", () => {
  it("returns 401 when not signed in", async () => {
    mockGetAuthUser.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    expect(res.status).toBe(401);
    expect(mockClaimPlayer).not.toHaveBeenCalled();
  });

  it("returns 400 when Discord ID is missing from session", async () => {
    mockGetDiscordId.mockReturnValueOnce(null);

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 when Discord username is missing from session", async () => {
    mockGetDiscordUsername.mockReturnValueOnce("");

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    expect(res.status).toBe(400);
  });

  it("returns 409 when this Discord account is already linked to a player", async () => {
    mockGetPlayerByDiscordId.mockResolvedValueOnce({
      id: "player-99",
      discordUsername: DISCORD_USERNAME,
      ign: "AlreadyLinked",
    } as Awaited<ReturnType<typeof getPlayerByDiscordId>>);

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    expect(res.status).toBe(409);
    expect(mockClaimPlayer).not.toHaveBeenCalled();
  });

  it("returns 409 with reason not_found when no matching player profile exists", async () => {
    mockClaimPlayer.mockResolvedValueOnce({ ok: false, reason: "not_found" });

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    const body = await res.json() as { error: string };
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/no player profile/i);
  });

  it("returns 409 with reason already_claimed when profile belongs to another account", async () => {
    mockClaimPlayer.mockResolvedValueOnce({ ok: false, reason: "already_claimed" });

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    const body = await res.json() as { error: string };
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already claimed/i);
  });

  it("returns 409 with reason discord_taken when Discord account links to a different player", async () => {
    mockClaimPlayer.mockResolvedValueOnce({ ok: false, reason: "discord_taken" });

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    expect(res.status).toBe(409);
  });

  it("returns 200 and ok:true on a successful claim", async () => {
    mockClaimPlayer.mockResolvedValueOnce({ ok: true, playerId: "player-42" });

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    const body = await res.json() as { ok: boolean };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("passes the server-resolved Discord username to claimPlayerByDiscordUsername — never a client value", async () => {
    mockClaimPlayer.mockResolvedValueOnce({ ok: true, playerId: "player-42" });

    const { POST } = await import("@/app/api/auth/claim/route");
    await POST(claimRequest());

    expect(mockClaimPlayer).toHaveBeenCalledWith(DISCORD_ID, DISCORD_USERNAME);
  });

  it("rate-limits: returns 429 when too many attempts", async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, resetAt: Date.now() + 30_000 });

    const { POST } = await import("@/app/api/auth/claim/route");
    const res = await POST(claimRequest());
    expect(res.status).toBe(429);
    expect(mockClaimPlayer).not.toHaveBeenCalled();
  });
});

// ── Concurrent claims — no crashes, no shared state corruption ───────────────

describe("Concurrent claim requests", () => {
  it("handles 5 concurrent claim calls without throwing", async () => {
    mockClaimPlayer.mockResolvedValue({ ok: true, playerId: "player-42" });

    const { POST } = await import("@/app/api/auth/claim/route");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => POST(claimRequest())),
    );

    for (const res of results) {
      // Each call should complete (200 or 409), never throw/500
      expect(res.status).toBeLessThan(500);
    }
    // DB-level "only one write succeeds" protection is enforced by the unique
    // constraint + RLS policy — verifiable only against a real Supabase instance.
  });
});

// ── Discord username matching edge cases ─────────────────────────────────────

describe("Discord username matching behaviour (documented contract)", () => {
  it("uses the session username — not any client-supplied value — for the lookup", async () => {
    mockClaimPlayer.mockResolvedValueOnce({ ok: true, playerId: "player-1" });
    mockGetDiscordUsername.mockReturnValueOnce("alice_99");

    const { POST } = await import("@/app/api/auth/claim/route");
    await POST(claimRequest());

    expect(mockClaimPlayer).toHaveBeenCalledWith(DISCORD_ID, "alice_99");
    // Implication: if the user has changed their Discord username since the
    // player row was imported, claimPlayerByDiscordUsername will return
    // not_found — the user falls through to the standard registration path.
    // TODO: Add Discord-ID-first matching so renames don't break returning players.
  });
});
