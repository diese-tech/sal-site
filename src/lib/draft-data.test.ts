import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/league-data", () => ({ saveSeasonRosterAssignment: vi.fn() }));

import { saveSeasonRosterAssignment } from "@/lib/league-data";
import { finalizeDraftRosters } from "./draft-data";

type QueryState = {
  table: string;
  op: "select" | "update";
  update?: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
  ins: Array<[string, unknown[]]>;
};

type QueryResult = { data: unknown; error: { message: string } | null };
type QueryHandler = (query: QueryState) => QueryResult;

class FakeQuery {
  private state: QueryState;

  constructor(table: string, private readonly handler: QueryHandler, private readonly executed: QueryState[]) {
    this.state = { table, op: "select", eqs: [], ins: [] };
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

    // Legacy parity: players.org_id/status bulk update, one per picking org.
    const playerUpdates = executed.filter((q) => q.table === "players" && q.op === "update");
    expect(playerUpdates).toHaveLength(2);
    expect(playerUpdates.map((q) => q.update)).toEqual([
      { org_id: "org-a", status: "drafted" },
      { org_id: "org-b", status: "drafted" },
    ]);
    expect(playerUpdates.map((q) => q.ins)).toEqual([
      [["id", ["p1", "p4"]]],
      [["id", ["p2", "p3"]]],
    ]);
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
