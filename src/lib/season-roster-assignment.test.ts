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
    expect(executed.some((q) => q.table === "players")).toBe(false);
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
