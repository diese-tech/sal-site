import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";

type PlayerRow = Database["public"]["Tables"]["players"]["Row"];

const mockState = vi.hoisted(() => ({
  rows: [] as unknown[],
  nullFilters: [] as string[],
}));

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => {
    const query = {
      is: (column: string) => {
        mockState.nullFilters.push(column);
        return query;
      },
      order: () => query,
      limit: () => Promise.resolve({ data: mockState.rows, error: null }),
    };
    return {
      from: () => ({
        select: () => ({
          ilike: () => query,
        }),
      }),
    };
  },
}));

function playerRow(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: "imported-player",
    archived_at: null,
    avatar_gradient: "from-cyan-500 to-indigo-500",
    avatar_initials: "IP",
    avatar_url: null,
    deletion_scheduled_at: null,
    discord_id: null,
    discord_username: "imported_handle",
    display_alias: null,
    division_id: "terra",
    ign: "Imported Captain",
    is_captain: true,
    is_starter: true,
    org_id: "existing-org",
    primary_role: "Support",
    profile_claimed: false,
    secondary_roles: ["Solo"],
    stats: null,
    status: "org-affiliated",
    ...overrides,
  };
}

describe("getPlayerClaimCandidateByDiscordUsername", () => {
  beforeEach(() => {
    mockState.rows = [];
    mockState.nullFilters = [];
  });

  it("finds a captain regardless of organization, division, role, or roster status", async () => {
    mockState.rows = [playerRow()];
    const { getPlayerClaimCandidateByDiscordUsername } = await import("./league-data");

    const result = await getPlayerClaimCandidateByDiscordUsername("imported_handle");

    expect(result).toEqual(expect.objectContaining({
      kind: "available",
      player: expect.objectContaining({
        id: "imported-player",
        isCaptain: true,
        primaryRole: "Support",
        status: "org-affiliated",
      }),
    }));
    expect(mockState.nullFilters).toEqual(["archived_at", "deletion_scheduled_at"]);
  });

  it("fails closed when more than one active identity matches", async () => {
    mockState.rows = [playerRow(), playerRow({ id: "duplicate-player" })];
    const { getPlayerClaimCandidateByDiscordUsername } = await import("./league-data");

    await expect(getPlayerClaimCandidateByDiscordUsername("imported_handle"))
      .resolves.toEqual({ kind: "ambiguous" });
  });
});
