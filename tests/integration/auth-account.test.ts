import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

const user = {
  id: "oauth-user",
  app_metadata: {},
  user_metadata: { provider_id: "attacker-id", name: "attacker#0" },
  identities: [{
    id: "discord-123",
    provider: "discord",
    identity_data: { name: "pringleimperialist#0" },
  }],
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
} as unknown as User;

vi.mock("@/lib/supabase-auth-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase-auth-server")>("@/lib/supabase-auth-server");
  return {
    getAuthUser: () => Promise.resolve(user),
    getDiscordId: actual.getDiscordId,
    getDiscordUsername: actual.getDiscordUsername,
  };
});

vi.mock("@/lib/league-data", () => ({
  getPlayerByDiscordId: vi.fn().mockResolvedValue({
    id: "player-pringle-import",
    ign: "Pringle Imperialist",
  }),
}));

describe("GET /api/auth/account", () => {
  it("returns the hardened Discord handle and linked player destination", async () => {
    const { GET } = await import("@/app/api/auth/account/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      discordUsername: "pringleimperialist",
      player: { id: "player-pringle-import", ign: "Pringle Imperialist" },
    });
  });
});
