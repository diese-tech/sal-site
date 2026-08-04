/**
 * Legacy player-column mirror for saveSeasonRosterAssignment (#230).
 *
 * Captain-bot/authorization consumers that have not migrated to season_rosters
 * (e.g. resolveRole() in god-draft-data.ts, via getPlayerByDiscordId) read
 * org_id/is_captain/status directly off the global `players` row. Any admin
 * captain/org assignment made through the season-scoped roster UI must stay
 * visible to those consumers, so saveSeasonRosterAssignment mirrors the write
 * onto `players` the same way finalizeDraftRosters already does for drafted
 * rosters (#210).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryState = {
  table: string;
  op: "select" | "update" | "upsert" | "insert" | "delete";
  payload?: unknown;
  eqs: Array<[string, unknown]>;
};

type QueryResult = { data: unknown; error: { message: string } | null };
type QueryHandler = (query: QueryState) => QueryResult;

class FakeQuery {
  private state: QueryState;

  constructor(table: string, private readonly handler: QueryHandler, private readonly executed: QueryState[]) {
    this.state = { table, op: "select", eqs: [] };
  }

  select() {
    return this;
  }

  upsert(payload: unknown) {
    this.state.op = "upsert";
    this.state.payload = payload;
    return this;
  }

  insert(payload: unknown) {
    this.state.op = "insert";
    this.state.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.state.op = "update";
    this.state.payload = payload;
    return this;
  }

  delete() {
    this.state.op = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.eqs.push([column, value]);
    return this;
  }

  neq(column: string, value: unknown) {
    this.state.eqs.push([`${column} not`, value]);
    return this;
  }

  in(column: string, value: unknown[]) {
    this.state.eqs.push([column, value]);
    return this;
  }

  limit() {
    return this;
  }

  is(column: string, value: unknown) {
    this.state.eqs.push([column, value]);
    return this;
  }

  single() {
    return this.execute();
  }

  maybeSingle() {
    return this.execute();
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    this.executed.push({ ...this.state, eqs: [...this.state.eqs] });
    return this.handler(this.state);
  }
}

let client: { from: (table: string) => FakeQuery; rpc?: (...args: unknown[]) => Promise<QueryResult> } | null = null;
let executed: QueryState[] = [];

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => client,
}));

function makeClient(handler: QueryHandler, rpc?: (...args: unknown[]) => Promise<QueryResult>) {
  return { from: (table: string) => new FakeQuery(table, handler, executed), rpc };
}

// currentSeasonId feeds getCurrentSeasonId()'s `seasons` table lookup, which
// gates the legacy players mirror — most tests need to say which season is
// "operational" for the mirror to fire at all.
function defaultHandler(overrides: Partial<Record<string, QueryResult>> = {}, currentSeasonId: string | null = null): QueryHandler {
  return (query) => {
    const override = overrides[query.table];
    if (override) return override;
    if (query.table === "players") return { data: { id: "available-player" }, error: null };
    if (query.table === "orgs") return { data: { id: "available-org" }, error: null };
    if (query.table === "season_orgs") return { data: { division_id: "solar" }, error: null };
    if (query.table === "seasons") return { data: currentSeasonId ? { id: currentSeasonId } : null, error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.resetModules();
  executed = [];
  client = null;
});

describe("saveSeasonRosterAssignment legacy player mirror (#230)", () => {
  it("rejects an archived player before writing a season roster assignment", async () => {
    client = makeClient(defaultHandler({ players: { data: null, error: null } }, "season-1"));
    const { saveSeasonRosterAssignment } = await import("./league-data");

    await expect(
      saveSeasonRosterAssignment({
        seasonId: "season-1",
        playerId: "archived-player",
        orgId: null,
        divisionId: "terra",
        isCaptain: false,
      }),
    ).rejects.toThrow("Cannot enroll unavailable player.");

    expect(executed.some((q) => q.table === "season_rosters" && q.op === "upsert")).toBe(false);
  });

  it("rejects a missing player before writing a season roster assignment", async () => {
    client = makeClient(defaultHandler({ players: { data: null, error: null } }, "season-1"));
    const { saveSeasonRosterAssignment } = await import("./league-data");

    await expect(
      saveSeasonRosterAssignment({
        seasonId: "season-1",
        playerId: "missing-player",
        orgId: null,
        divisionId: "terra",
        isCaptain: false,
      }),
    ).rejects.toThrow("Cannot enroll unavailable player.");

    expect(executed.some((q) => q.table === "season_rosters" && q.op === "upsert")).toBe(false);
  });

  it("rejects an unavailable org before writing an org-affiliated roster assignment", async () => {
    client = makeClient(defaultHandler({ orgs: { data: null, error: null } }, "season-1"));
    const { saveSeasonRosterAssignment } = await import("./league-data");

    await expect(
      saveSeasonRosterAssignment({
        seasonId: "season-1",
        playerId: "available-player",
        orgId: "archived-org",
        divisionId: null,
        isCaptain: false,
      }),
    ).rejects.toThrow("Cannot enroll unavailable org.");

    expect(executed.some((q) => q.table === "season_rosters" && q.op === "upsert")).toBe(false);
  });

  it("mirrors org_id/is_captain/status onto the legacy players row for a captain assignment in the current season", async () => {
    client = makeClient(defaultHandler({}, "season-1"));
    const { saveSeasonRosterAssignment } = await import("./league-data");

    await saveSeasonRosterAssignment({
      seasonId: "season-1",
      playerId: "p1",
      orgId: "org-a",
      divisionId: null,
      isCaptain: true,
    });

    const rosterUpsert = executed.find((q) => q.table === "season_rosters" && q.op === "upsert");
    expect(rosterUpsert?.payload).toMatchObject({
      season_id: "season-1",
      player_id: "p1",
      org_id: "org-a",
      division_id: "solar",
      is_captain: true,
      roster_status: "active",
    });

    const playerUpdate = executed.find((q) => q.table === "players" && q.op === "update");
    expect(playerUpdate?.payload).toEqual({ org_id: "org-a", is_captain: true, status: "org-affiliated" });
    expect(playerUpdate?.eqs).toEqual([["id", "p1"]]);
  });

  it("clears any prior captain for the same season org before assigning the replacement", async () => {
    client = makeClient(defaultHandler({}, "season-1"));
    const { saveSeasonRosterAssignment } = await import("./league-data");

    await saveSeasonRosterAssignment({
      seasonId: "season-1",
      playerId: "p-new",
      orgId: "org-a",
      divisionId: null,
      isCaptain: true,
    });

    const rosterWrites = executed.filter((q) => q.table === "season_rosters" && q.op !== "select");
    expect(rosterWrites[0]).toMatchObject({
      op: "update",
      payload: { is_captain: false, updated_at: expect.any(String) },
      eqs: [
        ["season_id", "season-1"],
        ["org_id", "org-a"],
        ["is_captain", true],
        ["player_id not", "p-new"],
      ],
    });
    expect(rosterWrites[1]).toMatchObject({ op: "upsert", payload: { player_id: "p-new", is_captain: true } });
  });

  it("clears captain/org legacy state for a free-agent (no-org) preseason enrollment", async () => {
    client = makeClient(defaultHandler({}, "preseason-2"));
    const { saveSeasonRosterAssignment } = await import("./league-data");

    await saveSeasonRosterAssignment({
      seasonId: "preseason-2",
      playerId: "p2",
      orgId: null,
      divisionId: "terra",
      // isCaptain is meaningless without an org — must be forced false everywhere.
      isCaptain: true,
    });

    const rosterUpsert = executed.find((q) => q.table === "season_rosters" && q.op === "upsert");
    expect(rosterUpsert?.payload).toMatchObject({
      org_id: null,
      division_id: "terra",
      is_captain: false,
      roster_status: "free_agent",
    });

    const playerUpdate = executed.find((q) => q.table === "players" && q.op === "update");
    expect(playerUpdate?.payload).toEqual({ org_id: null, is_captain: false, status: "free-agent" });
  });

  it("throws and never touches the legacy players row when the season_rosters upsert fails", async () => {
    client = makeClient(defaultHandler({ season_rosters: { data: null, error: { message: "boom" } } }, "s1"));
    const { saveSeasonRosterAssignment } = await import("./league-data");

    await expect(
      saveSeasonRosterAssignment({ seasonId: "s1", playerId: "p1", orgId: null, divisionId: "terra", isCaptain: false }),
    ).rejects.toThrow("boom");
    expect(executed.some((q) => q.table === "players" && q.op === "update")).toBe(false);
  });

  // Codex review (#230): editing a non-operational season (a historical
  // correction, or an Ingest from Preseason run before the target season goes
  // live) must not clobber the REAL current season's captain-bot state.
  it("does NOT mirror onto players when the edited season is not the current/operational season", async () => {
    client = makeClient(defaultHandler({}, "season-current"));
    const { saveSeasonRosterAssignment } = await import("./league-data");

    await saveSeasonRosterAssignment({
      seasonId: "season-historical",
      playerId: "p1",
      orgId: "org-a",
      divisionId: null,
      isCaptain: true,
    });

    const rosterUpsert = executed.find((q) => q.table === "season_rosters" && q.op === "upsert");
    expect(rosterUpsert?.payload).toMatchObject({ season_id: "season-historical", player_id: "p1", org_id: "org-a" });
    expect(executed.some((q) => q.table === "players" && q.op === "update")).toBe(false);
  });
});

describe("legacy admin forms synchronize the current season", () => {
  const player = {
    id: "player-captain",
    orgId: "org-returning",
    discordUsername: "captain",
    ign: "Captain",
    avatarInitials: "C",
    avatarGradient: "from-cyan-500 to-blue-500",
    primaryRole: "Support" as const,
    secondaryRoles: [],
    isStarter: false,
    isCaptain: true,
    divisionId: "terra" as const,
    status: "org-affiliated" as const,
  };

  const org = {
    id: "org-returning",
    name: "Returning Org",
    tag: "RET",
    divisionId: "terra" as const,
    logoInitials: "RET",
    logoGradient: "from-cyan-500 to-blue-500",
    primaryColor: "#22d3ee",
    accentGradient: "from-cyan-500 to-blue-500",
    captainId: "player-captain",
    socialLinks: {},
  };

  it("enrolls a returning org and persists a captain assignment when saving a player", async () => {
    client = makeClient(defaultHandler({}, "preseason-s2"));
    const { savePlayerForCurrentSeason } = await import("./league-data");

    await savePlayerForCurrentSeason(player);

    expect(executed.find((q) => q.table === "players" && q.op === "upsert")?.payload)
      .toMatchObject({ id: "player-captain", org_id: "org-returning", is_captain: true });
    expect(executed.find((q) => q.table === "season_orgs" && q.op === "upsert")?.payload)
      .toMatchObject({ season_id: "preseason-s2", org_id: "org-returning", division_id: "terra" });
    expect(executed.find((q) => q.table === "season_rosters" && q.op === "upsert")?.payload)
      .toMatchObject({
        season_id: "preseason-s2",
        player_id: "player-captain",
        org_id: "org-returning",
        is_captain: true,
      });
  });

  it("enrolls a returning org and its selected captain when saving the org", async () => {
    client = makeClient(defaultHandler({}, "preseason-s2"));
    const { saveOrgForCurrentSeason } = await import("./league-data");

    await saveOrgForCurrentSeason(org);

    expect(executed.find((q) => q.table === "orgs" && q.op === "upsert")?.payload)
      .toMatchObject({ id: "org-returning", captain_id: "player-captain" });
    expect(executed.find((q) => q.table === "season_orgs" && q.op === "upsert")?.payload)
      .toMatchObject({ season_id: "preseason-s2", org_id: "org-returning", division_id: "terra" });
    expect(executed.find((q) => q.table === "season_rosters" && q.op === "upsert")?.payload)
      .toMatchObject({ player_id: "player-captain", org_id: "org-returning", is_captain: true });
  });

  it("clears the current season captain when an org is saved with no captain", async () => {
    client = makeClient(defaultHandler({}, "preseason-s2"));
    const { saveOrgForCurrentSeason } = await import("./league-data");

    await saveOrgForCurrentSeason({ ...org, captainId: undefined });

    expect(executed.some((q) => q.table === "season_orgs" && q.op === "upsert")).toBe(false);

    expect(executed.find((q) =>
      q.table === "season_rosters"
      && q.op === "update"
      && (q.payload as { is_captain?: boolean }).is_captain === false,
    )).toMatchObject({
      eqs: [
        ["season_id", "preseason-s2"],
        ["org_id", "org-returning"],
        ["is_captain", true],
      ],
    });

    expect(executed.find((q) =>
      q.table === "players"
      && q.op === "update"
      && (q.payload as { is_captain?: boolean }).is_captain === false,
    )).toMatchObject({
      payload: { is_captain: false },
      eqs: [
        ["org_id", "org-returning"],
        ["is_captain", true],
      ],
    });
  });

  it("preserves the selected legacy status for an unassigned player", async () => {
    client = makeClient(defaultHandler({}, "preseason-s2"));
    const { savePlayerForCurrentSeason } = await import("./league-data");

    await savePlayerForCurrentSeason({
      ...player,
      orgId: undefined,
      isCaptain: false,
      status: "drafted",
    });

    const playerUpdates = executed.filter((q) => q.table === "players" && q.op === "update");
    expect(playerUpdates).toContainEqual(expect.objectContaining({
      payload: { org_id: null, is_captain: false, status: "drafted" },
      eqs: [["id", "player-captain"]],
    }));
  });

  it("keeps identity-only writes working when no current season exists", async () => {
    client = makeClient(defaultHandler({}, null));
    const { savePlayerForCurrentSeason } = await import("./league-data");

    await savePlayerForCurrentSeason(player);

    expect(executed.some((q) => q.table === "players" && q.op === "upsert")).toBe(true);
    expect(executed.some((q) => q.table === "season_orgs" && q.op === "upsert")).toBe(false);
    expect(executed.some((q) => q.table === "season_rosters" && q.op === "upsert")).toBe(false);
  });
});

describe("saveSeasonOrgAssignment availability guard (#237)", () => {
  it("rejects an archived org before writing a season org assignment", async () => {
    client = makeClient(defaultHandler({ orgs: { data: null, error: null } }));
    const { saveSeasonOrgAssignment } = await import("./league-data");

    await expect(saveSeasonOrgAssignment("season-1", "archived-org", "terra"))
      .rejects.toThrow("Cannot enroll unavailable org.");

    expect(executed.some((q) => q.table === "season_orgs" && q.op === "upsert")).toBe(false);
  });

  it("rejects a missing org before writing a season org assignment", async () => {
    client = makeClient(defaultHandler({ orgs: { data: null, error: null } }));
    const { saveSeasonOrgAssignment } = await import("./league-data");

    await expect(saveSeasonOrgAssignment("season-1", "missing-org", "terra"))
      .rejects.toThrow("Cannot enroll unavailable org.");

    expect(executed.some((q) => q.table === "season_orgs" && q.op === "upsert")).toBe(false);
  });

  it("continues to enroll an available org", async () => {
    client = makeClient(defaultHandler());
    const { saveSeasonOrgAssignment } = await import("./league-data");

    await saveSeasonOrgAssignment("season-1", "org-available", "terra");

    expect(executed.find((q) => q.table === "season_orgs" && q.op === "upsert")?.payload)
      .toMatchObject({ season_id: "season-1", org_id: "org-available", status: "active" });
  });
});

describe("archiveRecord season-participation guard (#237)", () => {
  it("rejects a player archive before any mutation when active participation exists", async () => {
    client = makeClient(defaultHandler({
      season_rosters: { data: { season_id: "season-1" }, error: null },
    }));
    const { archiveRecord } = await import("./league-data");

    await expect(archiveRecord("players", "player-1"))
      .rejects.toThrow("Remove the player from active season rosters first.");

    expect(executed.some((q) => q.op !== "select")).toBe(false);
  });

  it("rejects an org archive before any mutation when active participation exists", async () => {
    client = makeClient(defaultHandler({
      season_orgs: { data: { season_id: "season-1" }, error: null },
    }));
    const { archiveRecord } = await import("./league-data");

    await expect(archiveRecord("orgs", "org-1"))
      .rejects.toThrow("Remove the org from active season assignments first.");

    expect(executed.some((q) => q.op !== "select")).toBe(false);
  });

  it("uses the same fail-closed guard when scheduling deletion", async () => {
    client = makeClient(defaultHandler({
      season_rosters: { data: { season_id: "season-1" }, error: null },
    }));
    const { scheduleDelete } = await import("./league-data");

    await expect(scheduleDelete("players", "player-1"))
      .rejects.toThrow("Remove the player from active season rosters first.");

    expect(executed.some((q) => q.op !== "select")).toBe(false);
  });

  it("archives normally when the player has no active participation", async () => {
    client = makeClient(defaultHandler());
    const { archiveRecord } = await import("./league-data");

    await archiveRecord("players", "player-1");

    expect(executed.find((q) => q.table === "players" && q.op === "update")?.payload)
      .toMatchObject({ archived_at: expect.any(String) });
  });
});

describe("removeSeasonRosterAssignment legacy player mirror (#234)", () => {
  it("clears org_id/is_captain/status on the legacy players row when removing from the current season", async () => {
    client = makeClient(defaultHandler({}, "season-current"));
    const { removeSeasonRosterAssignment } = await import("./league-data");

    await removeSeasonRosterAssignment("season-current", "p1");

    const rosterDelete = executed.find((q) => q.table === "season_rosters" && q.op === "delete");
    expect(rosterDelete?.eqs).toEqual([["season_id", "season-current"], ["player_id", "p1"]]);

    const playerUpdate = executed.find((q) => q.table === "players" && q.op === "update");
    expect(playerUpdate?.payload).toEqual({ org_id: null, is_captain: false, status: "free-agent" });
    expect(playerUpdate?.eqs).toEqual([["id", "p1"]]);
  });

  it("does NOT touch the legacy players row when removing from a non-operational season", async () => {
    client = makeClient(defaultHandler({}, "season-current"));
    const { removeSeasonRosterAssignment } = await import("./league-data");

    await removeSeasonRosterAssignment("season-historical", "p1");

    expect(executed.some((q) => q.table === "players" && q.op === "update")).toBe(false);
  });

  it("throws and never touches the legacy players row when the season_rosters delete fails", async () => {
    client = makeClient(defaultHandler({ season_rosters: { data: null, error: { message: "boom" } } }, "season-current"));
    const { removeSeasonRosterAssignment } = await import("./league-data");

    await expect(removeSeasonRosterAssignment("season-current", "p1")).rejects.toThrow("boom");
    expect(executed.some((q) => q.table === "players")).toBe(false);
  });
});

describe("setCurrentSeason legacy resync (#230)", () => {
  it("mirrors every season_rosters row for the newly-current season onto players", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    client = makeClient(
      (query) => {
        if (query.table === "season_rosters") {
          return {
            data: [
              { player_id: "p1", org_id: "org-a", is_captain: true },
              { player_id: "p2", org_id: null, is_captain: false },
            ],
            error: null,
          };
        }
        return { data: null, error: null };
      },
      rpc,
    );
    const { setCurrentSeason } = await import("./league-data");

    await setCurrentSeason("season-2");

    expect(rpc).toHaveBeenCalledWith("set_current_season", { p_season_id: "season-2" });
    const playerUpdates = executed.filter((q) => q.table === "players" && q.op === "update");
    expect(playerUpdates).toHaveLength(2);
    expect(playerUpdates[0].payload).toEqual({ org_id: "org-a", is_captain: true, status: "org-affiliated" });
    expect(playerUpdates[0].eqs).toEqual([["id", "p1"]]);
    expect(playerUpdates[1].payload).toEqual({ org_id: null, is_captain: false, status: "free-agent" });
    expect(playerUpdates[1].eqs).toEqual([["id", "p2"]]);
  });
});
