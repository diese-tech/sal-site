import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/league-data", () => ({ saveSeasonRosterAssignment: vi.fn(), getCurrentSeasonId: vi.fn() }));

import { getCurrentSeasonId, saveSeasonRosterAssignment } from "@/lib/league-data";
import { finalizeDraftRosters, issueTeamAccessCode, listTeamAccessCodes, redeemDraftAccess, getTopShortlistPick } from "./draft-data";
import { isAccessCode } from "./draft-access-code";

type QueryState = {
  table: string;
  op: "select" | "update" | "insert" | "upsert" | "delete";
  update?: Record<string, unknown>;
  insert?: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
  neqs: Array<[string, unknown]>;
  gts: Array<[string, unknown]>;
  ins: Array<[string, unknown[]]>;
};

type QueryResult = { data: unknown; error: { message: string } | null };
type QueryHandler = (query: QueryState) => QueryResult;

class FakeQuery {
  private state: QueryState;

  constructor(table: string, private readonly handler: QueryHandler, private readonly executed: QueryState[]) {
    this.state = { table, op: "select", eqs: [], neqs: [], gts: [], ins: [] };
  }

  select() {
    return this;
  }

  update(values: Record<string, unknown>) {
    this.state.op = "update";
    this.state.update = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.eqs.push([column, value]);
    return this;
  }

  neq(column: string, value: unknown) {
    this.state.neqs.push([column, value]);
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.state.op = "insert";
    this.state.insert = values;
    return this;
  }

  upsert(values: Record<string, unknown>) {
    this.state.op = "upsert";
    this.state.insert = values;
    return this;
  }

  delete() {
    this.state.op = "delete";
    return this;
  }

  gt(column: string, value: unknown) {
    this.state.gts.push([column, value]);
    return this;
  }

  limit() {
    return this;
  }

  single() {
    return this.execute();
  }

  in(column: string, values: unknown[]) {
    this.state.ins.push([column, values]);
    return this;
  }

  order() {
    return this;
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
    this.executed.push(this.state);
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

const room = {
  id: "room-1",
  season_id: "season-1",
  division_id: "solar",
  status: "complete",
  rounds: 2,
  pick_timer_seconds: 120,
  base_order: ["org-a", "org-b"],
  current_pick_index: 4,
  pick_started_at: null,
  created_at: "2026-07-01T00:00:00Z",
  started_at: "2026-07-01T01:00:00Z",
  completed_at: "2026-07-01T02:00:00Z",
};

const picks = [
  { id: 1, draft_room_id: "room-1", pick_number: 1, org_id: "org-a", player_id: "p1", picked_at: "2026-07-01T01:10:00Z" },
  { id: 2, draft_room_id: "room-1", pick_number: 2, org_id: "org-b", player_id: "p2", picked_at: "2026-07-01T01:20:00Z" },
  { id: 3, draft_room_id: "room-1", pick_number: 3, org_id: "org-b", player_id: "p3", picked_at: "2026-07-01T01:30:00Z" },
  { id: 4, draft_room_id: "room-1", pick_number: 4, org_id: "org-a", player_id: "p4", picked_at: "2026-07-01T01:40:00Z" },
];

function handlerFor(overrides: Partial<Record<string, QueryResult>>): QueryHandler {
  return (query) => {
    const override = overrides[query.table];
    if (override) return override;
    if (query.table === "draft_rooms") return { data: room, error: null };
    if (query.table === "draft_picks") return { data: picks, error: null };
    if (query.table === "season_orgs") return { data: [{ org_id: "org-a" }, { org_id: "org-b" }], error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  executed = [];
  client = null;
});

describe("finalizeDraftRosters publishes season rosters (#210)", () => {
  it("writes one season roster assignment per pick via the canonical path", async () => {
    client = makeClient(handlerFor({}));
    vi.mocked(getCurrentSeasonId).mockResolvedValue("season-1");

    await expect(finalizeDraftRosters("room-1")).resolves.toEqual({ assigned: 4 });

    expect(saveSeasonRosterAssignment).toHaveBeenCalledTimes(4);
    for (const pick of picks) {
      expect(saveSeasonRosterAssignment).toHaveBeenCalledWith({
        seasonId: "season-1",
        playerId: pick.player_id,
        orgId: pick.org_id,
        divisionId: "solar",
        isCaptain: false,
      });
    }

    // Legacy parity: players.org_id/division_id/status bulk update, one per picking org.
    const playerUpdates = executed.filter((q) => q.table === "players" && q.op === "update");
    expect(playerUpdates).toHaveLength(2);
    expect(playerUpdates.map((q) => q.update)).toEqual([
      { org_id: "org-a", division_id: "solar", status: "drafted" },
      { org_id: "org-b", division_id: "solar", status: "drafted" },
    ]);
    expect(playerUpdates.map((q) => q.ins)).toEqual([
      [["id", ["p1", "p4"]]],
      [["id", ["p2", "p3"]]],
    ]);
  });

  it("publishes season_rosters for a non-current season without touching the live season's legacy players columns", async () => {
    // A draft room can be created for a future/preseason season while a different
    // season is still operational (#210 comment). The canonical season_rosters
    // write must still happen for every pick, but the legacy players mirror —
    // read by captain-bot/resolveRole for the CURRENT season only — must not be
    // clobbered by a draft finalized for a season that isn't live yet.
    client = makeClient(handlerFor({}));
    vi.mocked(getCurrentSeasonId).mockResolvedValue("some-other-live-season");

    await expect(finalizeDraftRosters("room-1")).resolves.toEqual({ assigned: 4 });

    expect(saveSeasonRosterAssignment).toHaveBeenCalledTimes(4);
    const playerUpdates = executed.filter((q) => q.table === "players" && q.op === "update");
    expect(playerUpdates).toHaveLength(0);
  });

  it("throws naming the missing org and makes no roster writes when a picking org is not in season_orgs", async () => {
    client = makeClient(handlerFor({ season_orgs: { data: [{ org_id: "org-a" }], error: null } }));

    await expect(finalizeDraftRosters("room-1")).rejects.toThrow(
      "Cannot publish rosters: org(s) not assigned to season season-1: org-b",
    );

    expect(saveSeasonRosterAssignment).not.toHaveBeenCalled();
    expect(executed.some((q) => q.op === "update")).toBe(false);
  });

  it("throws when the draft is not complete", async () => {
    client = makeClient(handlerFor({ draft_rooms: { data: { ...room, status: "active" }, error: null } }));

    await expect(finalizeDraftRosters("room-1")).rejects.toThrow("Draft is not complete.");

    expect(saveSeasonRosterAssignment).not.toHaveBeenCalled();
  });
});

describe("getTopShortlistPick excludes season-wide drafted players (#206)", () => {
  // Two rooms in the season; p1 was drafted in the OTHER room (room-2).
  const seasonHandler = handlerFor({
    captain_shortlists: { data: [{ player_id: "p1" }, { player_id: "p2" }], error: null },
    draft_rooms: { data: [{ id: "room-1" }, { id: "room-2" }], error: null },
    draft_picks: { data: [{ player_id: "p1" }], error: null },
  });

  it("skips a shortlisted player drafted in another room and returns the next entry", async () => {
    client = makeClient(seasonHandler);

    await expect(getTopShortlistPick("room-1", "org-a", "season-1")).resolves.toBe("p2");

    // Drafted set is built across every room in the season, not just room-1.
    const pickQuery = executed.find((q) => q.table === "draft_picks");
    expect(pickQuery?.ins).toEqual([["draft_room_id", ["room-1", "room-2"]]]);
    const roomQuery = executed.find((q) => q.table === "draft_rooms");
    expect(roomQuery?.neqs).toEqual([["status", "voided"]]);
  });

  it("returns null when every shortlisted player is drafted somewhere this season", async () => {
    client = makeClient(handlerFor({
      captain_shortlists: { data: [{ player_id: "p1" }, { player_id: "p2" }], error: null },
      draft_rooms: { data: [{ id: "room-1" }, { id: "room-2" }], error: null },
      draft_picks: { data: [{ player_id: "p1" }, { player_id: "p2" }], error: null },
    }));

    await expect(getTopShortlistPick("room-1", "org-a", "season-1")).resolves.toBeNull();
  });

  it("skips entries rejected by the eligibility predicate (stale cross-division shortlists)", async () => {
    client = makeClient(handlerFor({
      captain_shortlists: { data: [{ player_id: "p1" }, { player_id: "p2" }], error: null },
      draft_rooms: { data: [{ id: "room-1" }], error: null },
      draft_picks: { data: [], error: null },
    }));

    await expect(
      getTopShortlistPick("room-1", "org-a", "season-1", (playerId) => playerId !== "p1"),
    ).resolves.toBe("p2");
    await expect(
      getTopShortlistPick("room-1", "org-a", "season-1", () => false),
    ).resolves.toBeNull();
  });
});

describe("issueTeamAccessCode persistence", () => {
  it("replaces the seat credential atomically in one upsert", async () => {
    client = makeClient(handlerFor({ captain_tokens: { data: null, error: null } }));

    const code = await issueTeamAccessCode("room-1", "org-a");

    expect(isAccessCode(code)).toBe(true);

    const captainQueries = executed.filter((entry) => entry.table === "captain_tokens");
    expect(captainQueries).toHaveLength(1);
    expect(captainQueries[0]?.op).toBe("upsert");
    expect(captainQueries[0]?.insert).toMatchObject({
      id: code,
      draft_room_id: "room-1",
      org_id: "org-a",
      token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expires_at: expect.any(String),
    });
  });

  it("never deletes the old credential first, so a failed rotation leaves the seat usable", async () => {
    client = makeClient(handlerFor({
      captain_tokens: { data: null, error: { message: "captain token upsert failed" } },
    }));

    await expect(issueTeamAccessCode("room-1", "org-a")).rejects.toMatchObject({
      message: "captain token upsert failed",
    });

    // The previous code must survive a failed rotation — a seat left with no
    // credential is the mid-draft lockout this feature exists to prevent.
    expect(executed.filter((e) => e.table === "captain_tokens" && e.op === "delete")).toHaveLength(0);
  });
});

describe("redeemDraftAccess", () => {
  it("resolves a seat without deleting the row, so the code stays reusable", async () => {
    client = makeClient(handlerFor({
      captain_tokens: { data: [{ draft_room_id: "room-1", org_id: "org-a" }], error: null },
    }));

    await expect(redeemDraftAccess("H7K2QM4X")).resolves.toEqual({
      draftRoomId: "room-1",
      orgId: "org-a",
    });

    const ops = executed.filter((e) => e.table === "captain_tokens").map((e) => e.op);
    expect(ops).not.toContain("delete");
  });

  it("accepts the formatted and lowercase forms a captain actually types", async () => {
    client = makeClient(handlerFor({
      captain_tokens: { data: [{ draft_room_id: "room-1", org_id: "org-a" }], error: null },
    }));

    await expect(redeemDraftAccess("  h7k2-qm4x ")).resolves.toEqual({
      draftRoomId: "room-1",
      orgId: "org-a",
    });

    // Both the raw string and the normalized code are looked up, so legacy
    // link tokens keep working alongside short codes.
    const query = executed.find((e) => e.table === "captain_tokens");
    expect(query?.ins[0]?.[0]).toBe("token_hash");
    expect(query?.ins[0]?.[1]).toHaveLength(2);
  });

  it("filters out expired credentials in the query", async () => {
    client = makeClient(handlerFor({ captain_tokens: { data: [], error: null } }));

    await expect(redeemDraftAccess("H7K2QM4X")).resolves.toBeNull();

    const query = executed.find((e) => e.table === "captain_tokens");
    expect(query?.gts[0]?.[0]).toBe("expires_at");
  });

  it("returns null for blank input without querying", async () => {
    client = makeClient(handlerFor({}));

    await expect(redeemDraftAccess("   ")).resolves.toBeNull();
    expect(executed.filter((e) => e.table === "captain_tokens")).toHaveLength(0);
  });

  it("returns null when the lookup errors", async () => {
    client = makeClient(handlerFor({
      captain_tokens: { data: null, error: { message: "boom" } },
    }));

    await expect(redeemDraftAccess("H7K2QM4X")).resolves.toBeNull();
  });
});

describe("listTeamAccessCodes", () => {
  it("returns plaintext codes so an admin can re-read them mid-draft", async () => {
    client = makeClient(handlerFor({
      captain_tokens: {
        data: [{ id: "H7K2QM4X", org_id: "org-a", expires_at: "2026-09-01T00:00:00Z" }],
        error: null,
      },
    }));

    await expect(listTeamAccessCodes("room-1")).resolves.toEqual([
      { orgId: "org-a", code: "H7K2QM4X", expiresAt: "2026-09-01T00:00:00Z", isLegacyLink: false },
    ]);
  });

  it("flags pre-existing one-time link tokens so they can be replaced", async () => {
    client = makeClient(handlerFor({
      captain_tokens: {
        data: [{ id: "aVeryLongLegacyLinkToken_123456", org_id: "org-b", expires_at: "2026-09-01T00:00:00Z" }],
        error: null,
      },
    }));

    const codes = await listTeamAccessCodes("room-1");
    expect(codes[0]?.isLegacyLink).toBe(true);
  });

  it("returns an empty list when the lookup errors", async () => {
    client = makeClient(handlerFor({
      captain_tokens: { data: null, error: { message: "boom" } },
    }));

    await expect(listTeamAccessCodes("room-1")).resolves.toEqual([]);
  });
});
