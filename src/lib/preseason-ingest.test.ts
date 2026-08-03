/**
 * "Ingest from Preseason" tests (#230 part 3).
 *
 * Covers the preview (orgs & captains grouped before free agents, grouped by
 * division) and the apply flow (orgs enrolled into the target season before
 * roster rows, ordinary players stay team-unassigned, captains keep their
 * org, no stats touched, source === target rejected).
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

  order() {
    return this;
  }

  is() {
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

let client: { from: (table: string) => FakeQuery } | null = null;
let executed: QueryState[] = [];

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => client,
}));

function makeClient(handler: QueryHandler) {
  return { from: (table: string) => new FakeQuery(table, handler, executed) };
}

const divisions = [
  { id: "terra", name: "Terra", description: "", tier: 1, accent_color: "#000" },
  { id: "solar", name: "Solar", description: "", tier: 2, accent_color: "#000" },
  { id: "lunar", name: "Lunar", description: "", tier: 3, accent_color: "#000" },
];

const orgs = [
  { id: "org-a", name: "Obsidian Knights", tag: "OBS", division_id: "terra", logo_initials: "OK", logo_gradient: "g", primary_color: "#fff", accent_gradient: "g" },
  { id: "org-b", name: "Another Org", tag: "AO", division_id: "solar", logo_initials: "AO", logo_gradient: "g", primary_color: "#fff", accent_gradient: "g" },
];

const players = [
  { id: "p-captain-a", org_id: "org-a", discord_username: "capA", ign: "PlayerOne", avatar_initials: "P1", avatar_gradient: "g", primary_role: "Solo", secondary_roles: [], is_starter: false, is_captain: true, division_id: "terra", status: "org-affiliated", stats: null },
  { id: "p-fa-1", org_id: null, discord_username: "faOne", ign: "FreeAgentAlpha", avatar_initials: "FA", avatar_gradient: "g", primary_role: "Mid", secondary_roles: [], is_starter: false, is_captain: false, division_id: "terra", status: "free-agent", stats: null },
  { id: "p-fa-2", org_id: null, discord_username: "faTwo", ign: "FreeAgentBeta", avatar_initials: "FB", avatar_gradient: "g", primary_role: "Jungle", secondary_roles: [], is_starter: false, is_captain: false, division_id: "solar", status: "free-agent", stats: null },
  { id: "p-inactive", org_id: null, discord_username: "gone", ign: "RemovedPlayer", avatar_initials: "RP", avatar_gradient: "g", primary_role: "Flex", secondary_roles: [], is_starter: false, is_captain: false, division_id: "solar", status: "free-agent", stats: null },
];

const seasonOrgs = [
  { org_id: "org-a", division_id: "terra", status: "active" },
];

const rosterRows = [
  { player_id: "p-captain-a", org_id: "org-a", division_id: "terra", is_captain: true, roster_status: "active" },
  { player_id: "p-fa-1", org_id: null, division_id: "terra", is_captain: false, roster_status: "free_agent" },
  { player_id: "p-fa-2", org_id: null, division_id: "solar", is_captain: false, roster_status: "free_agent" },
  { player_id: "p-inactive", org_id: null, division_id: "solar", is_captain: false, roster_status: "inactive" },
];

function handlerFor(overrides: Partial<Record<string, QueryResult>> = {}): QueryHandler {
  return (query) => {
    const override = overrides[query.table];
    if (override) return override;
    if (query.table === "divisions") return { data: divisions, error: null };
    if (query.table === "orgs") return { data: orgs, error: null };
    if (query.table === "players") return { data: players, error: null };
    if (query.table === "season_orgs") return { data: seasonOrgs, error: null };
    if (query.table === "season_rosters") return { data: rosterRows, error: null };
    return { data: null, error: null };
  };
}

const seasonsList = [
  { id: "preseason-2", name: "Preseason 2", status: "pre-season", is_current: true, start_date: "2026-01-01", end_date: "2026-02-01", current_week: 0 },
  { id: "season-2", name: "Season 2", status: "pre-season", is_current: false, start_date: "2026-03-01", end_date: "2026-06-01", current_week: 0 },
];

// getAllSeasons() queries `seasons` with no filter (order by start_date), while
// getSeasonRosterAdminData()'s season lookup does .eq("id", seasonId).single() —
// the fake needs to serve both shapes off the same seasonsList fixture.
const allSeasonsHandler: QueryHandler = (query) => {
  if (query.table === "seasons") {
    const idEq = query.eqs.find(([col]) => col === "id");
    if (idEq) {
      const found = seasonsList.find((s) => s.id === idEq[1]);
      return { data: found ?? null, error: null };
    }
    return { data: seasonsList, error: null };
  }
  return handlerFor()(query);
};

beforeEach(() => {
  vi.resetModules();
  executed = [];
  client = null;
});

describe("getPreseasonIngestPreview", () => {
  it("builds a preview with orgs+captains and free agents grouped by division, excluding inactive rows", async () => {
    client = makeClient(allSeasonsHandler);
    const { getPreseasonIngestPreview } = await import("./preseason-ingest");

    const preview = await getPreseasonIngestPreview("preseason-2", "season-2");

    expect(preview.sourceSeasonName).toBe("Preseason 2");
    expect(preview.targetSeasonName).toBe("Season 2");
    expect(preview.orgCount).toBe(1);
    expect(preview.captainCount).toBe(1);
    expect(preview.freeAgentCount).toBe(2); // inactive row excluded
    expect(preview.totalPlayers).toBe(3);

    const terra = preview.divisions.find((d) => d.divisionId === "terra")!;
    expect(terra.orgs).toEqual([{ orgId: "org-a", orgName: "Obsidian Knights", orgTag: "OBS", captainId: "p-captain-a", captainIgn: "PlayerOne" }]);
    expect(terra.freeAgents).toEqual([{ playerId: "p-fa-1", ign: "FreeAgentAlpha" }]);

    const solar = preview.divisions.find((d) => d.divisionId === "solar")!;
    expect(solar.orgs).toEqual([]);
    // The inactive player must not appear even though it's in the same division.
    expect(solar.freeAgents).toEqual([{ playerId: "p-fa-2", ign: "FreeAgentBeta" }]);
  });

  it("rejects ingesting a season into itself", async () => {
    client = makeClient(allSeasonsHandler);
    const { getPreseasonIngestPreview } = await import("./preseason-ingest");

    await expect(getPreseasonIngestPreview("preseason-2", "preseason-2")).rejects.toThrow(
      "Source and target season must differ.",
    );
  });

  it("throws a clear error when the target season does not exist", async () => {
    client = makeClient(allSeasonsHandler);
    const { getPreseasonIngestPreview } = await import("./preseason-ingest");

    await expect(getPreseasonIngestPreview("preseason-2", "ghost-season")).rejects.toThrow(
      'Target season "ghost-season" does not exist.',
    );
  });
});

describe("ingestSeasonFromPreseason", () => {
  it("enrolls the org into the target season before writing roster rows, preserves captain+org, keeps ordinary players team-unassigned", async () => {
    client = makeClient(allSeasonsHandler);
    const { ingestSeasonFromPreseason } = await import("./preseason-ingest");

    const result = await ingestSeasonFromPreseason("preseason-2", "season-2");
    expect(result).toEqual({ orgsIngested: 1, playersIngested: 3 });

    const orgUpsertIndex = executed.findIndex((q) => q.table === "season_orgs" && q.op === "upsert");
    const rosterUpsertIndexes = executed.flatMap((q, i) => (q.table === "season_rosters" && q.op === "upsert" ? [i] : []));
    expect(orgUpsertIndex).toBeGreaterThanOrEqual(0);
    // Org enrollment must precede every roster write for the target season.
    for (const i of rosterUpsertIndexes) expect(i).toBeGreaterThan(orgUpsertIndex);

    const orgUpsert = executed[orgUpsertIndex];
    expect(orgUpsert.payload).toMatchObject({ season_id: "season-2", org_id: "org-a", division_id: "terra", status: "active" });

    const rosterPayloads = rosterUpsertIndexes.map((i) => executed[i].payload);
    expect(rosterPayloads).toContainEqual(
      expect.objectContaining({ season_id: "season-2", player_id: "p-captain-a", org_id: "org-a", is_captain: true }),
    );
    expect(rosterPayloads).toContainEqual(
      expect.objectContaining({ season_id: "season-2", player_id: "p-fa-1", org_id: null, is_captain: false, roster_status: "free_agent" }),
    );
    expect(rosterPayloads).toContainEqual(
      expect.objectContaining({ season_id: "season-2", player_id: "p-fa-2", org_id: null, is_captain: false, roster_status: "free_agent" }),
    );
    // The inactive preseason row must never be ingested.
    expect(rosterPayloads.some((p) => (p as { player_id: string }).player_id === "p-inactive")).toBe(false);

    // Never touches matches/player_match_stats — no preseason stats copied.
    expect(executed.some((q) => q.table === "matches" || q.table === "player_match_stats")).toBe(false);
  });

  it("rejects ingesting a season into itself without writing anything", async () => {
    client = makeClient(allSeasonsHandler);
    const { ingestSeasonFromPreseason } = await import("./preseason-ingest");

    await expect(ingestSeasonFromPreseason("preseason-2", "preseason-2")).rejects.toThrow(
      "Source and target season must differ.",
    );
    expect(executed.some((q) => q.op === "upsert")).toBe(false);
  });
});
