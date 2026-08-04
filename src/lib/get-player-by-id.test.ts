/**
 * getPlayerById — unscoped-by-season player lookup (#230/#233 follow-up).
 *
 * A player row can exist with no season_rosters entry in any season (e.g. a
 * registration approved before season enrollment was wired up). The public
 * profile page (src/app/players/[id]/page.tsx) falls back to this function
 * instead of 404ing when the season-scoped catalog doesn't have the id.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: { message: string } | null };

let client: { from: (table: string) => unknown } | null = null;

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => client,
}));

function makeClient(row: Record<string, unknown> | null, error: { message: string } | null = null) {
  return {
    from: (table: string) => {
      if (table !== "players") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: (): Promise<QueryResult> => Promise.resolve({ data: row, error }),
            }),
          }),
        }),
      };
    },
  };
}

const dbPlayerRow = {
  id: "p-unenrolled",
  org_id: null,
  discord_username: "brawler99",
  ign: "BrawlerNinety",
  display_alias: null,
  avatar_initials: "BN",
  avatar_gradient: "g",
  primary_role: "Solo",
  secondary_roles: [],
  is_starter: false,
  is_captain: false,
  division_id: null,
  status: "free-agent",
  stats: null,
  archived_at: null,
  deletion_scheduled_at: null,
};

beforeEach(() => {
  vi.resetModules();
  client = null;
});

describe("getPlayerById", () => {
  it("returns the player identity even with no season_rosters row anywhere", async () => {
    client = makeClient(dbPlayerRow);
    const { getPlayerById } = await import("./league-data");

    const player = await getPlayerById("p-unenrolled");
    expect(player).toMatchObject({ id: "p-unenrolled", ign: "BrawlerNinety", orgId: undefined, divisionId: undefined });
  });

  it("returns null when no player row matches", async () => {
    client = makeClient(null);
    const { getPlayerById } = await import("./league-data");

    expect(await getPlayerById("does-not-exist")).toBeNull();
  });

  it("returns null when Supabase isn't configured", async () => {
    client = null;
    const { getPlayerById } = await import("./league-data");

    expect(await getPlayerById("p-unenrolled")).toBeNull();
  });

  it("throws on a query error", async () => {
    client = makeClient(null, { message: "boom" });
    const { getPlayerById } = await import("./league-data");

    await expect(getPlayerById("p-unenrolled")).rejects.toThrow("boom");
  });
});
