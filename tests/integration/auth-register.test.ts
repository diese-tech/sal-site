/**
 * POST /api/auth/register — Discord username guard (#233 Codex review).
 *
 * A registration keys uniqueness off discord_id (getRegistrationByDiscordId
 * returns 409 for a second attempt), so persisting a registration with a
 * blank discordUsername would leave that user permanently stuck with no way
 * to retry. The route must reject before writing anything when
 * getDiscordUsername() can't resolve a real username, rather than silently
 * saving the empty fallback.
 */

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/rate-limit", () => ({
  getRateLimitIdentifier: () => "127.0.0.1",
  checkRateLimit: () => ({ allowed: true, remaining: 10, resetAt: Date.now() + 1000 }),
  retryAfterSeconds: () => "1",
}));

let authUser: User | null = null;

vi.mock("@/lib/supabase-auth-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase-auth-server")>("@/lib/supabase-auth-server");
  return {
    getAuthUser: () => Promise.resolve(authUser),
    getDiscordId: actual.getDiscordId,
    getDiscordUsername: actual.getDiscordUsername,
    getDiscordDisplayName: actual.getDiscordDisplayName,
  };
});

vi.mock("@/lib/league-data", () => ({
  createRegistration: vi.fn().mockResolvedValue(undefined),
  getCurrentSeasonId: vi.fn().mockResolvedValue("preseason-2"),
  getRegistrationByDiscordId: vi.fn().mockResolvedValue(null),
}));

function makeUser(user_metadata: Record<string, unknown>, identities: unknown[] = []): User {
  return {
    id: "user-1",
    app_metadata: {},
    user_metadata,
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    identities: identities as User["identities"],
  } as User;
}

function makeRequest() {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ formData: { name: "Test" } }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/register — Discord username guard", () => {
  it("returns 400 and never creates a registration when no username can be resolved anywhere in the session", async () => {
    authUser = makeUser({ provider_id: "123456789" }); // no user_name, no matching discord identity
    const { POST } = await import("@/app/api/auth/register/route");
    const { createRegistration } = await import("@/lib/league-data");
    vi.mocked(createRegistration).mockClear();

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/discord username/i);
    expect(createRegistration).not.toHaveBeenCalled();
  });

  it("succeeds using user_metadata.user_name when present", async () => {
    authUser = makeUser({ provider_id: "123456789", user_name: "brawler99" });
    const { POST } = await import("@/app/api/auth/register/route");
    const { createRegistration } = await import("@/lib/league-data");
    vi.mocked(createRegistration).mockClear();

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ discordUsername: "brawler99" }),
    );
  });

  it("recovers the username from the Discord identity's identity_data when user_metadata.user_name is absent", async () => {
    authUser = makeUser(
      { provider_id: "123456789" },
      [{ provider: "discord", identity_data: { user_name: "recovered_handle" } }],
    );
    const { POST } = await import("@/app/api/auth/register/route");
    const { createRegistration } = await import("@/lib/league-data");
    vi.mocked(createRegistration).mockClear();

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ discordUsername: "recovered_handle" }),
    );
  });
});
