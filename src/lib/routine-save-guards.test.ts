import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryState = {
  table: string;
  op: "select" | "update" | "insert" | "upsert";
  eqs: Array<[string, unknown]>;
  selection?: string;
  deletionScheduleMustBeNull?: boolean;
  payload?: unknown;
};

type QueryResult = { data: unknown; error: { message: string } | null };
type RecordState = "new" | "active" | "scheduled" | "raced";

let targetTable = "players";
let recordState: RecordState = "active";
let executed: QueryState[] = [];
let existingCaptainRow: { org_id: string | null; division_id: string | null; is_captain: boolean } | null = null;
let orgCaptainRows: Array<{ player_id: string }> = [];
let failingAuditTable: string | null = null;

class FakeQuery {
  private state: QueryState;

  constructor(table: string) {
    this.state = { table, op: "select", eqs: [] };
  }

  select(columns?: string) { this.state.selection = columns; return this; }
  eq(column: string, value: unknown) { this.state.eqs.push([column, value]); return this; }
  neq(column: string, value: unknown) { this.state.eqs.push([`${column} not`, value]); return this; }
  is(column: string, value: unknown) {
    if (column === "deletion_scheduled_at" && value === null) this.state.deletionScheduleMustBeNull = true;
    return this;
  }
  in() { return this; }
  limit() { return this; }
  order() { return this; }

  update(payload: unknown) { this.state.op = "update"; this.state.payload = payload; return this; }
  insert(payload: unknown) { this.state.op = "insert"; this.state.payload = payload; return this; }
  upsert(payload: unknown) { this.state.op = "upsert"; this.state.payload = payload; return this; }
  single() { return this.execute(); }
  maybeSingle() { return this.execute(); }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    executed.push({ ...this.state, eqs: [...this.state.eqs] });
    if (this.state.table === failingAuditTable && this.state.op === "insert") {
      return { data: null, error: { message: "audit insert failed" } };
    }
    if (this.state.table === "seasons") return { data: { id: "season-1" }, error: null };
    if (this.state.table === "players" && this.state.op === "select" && this.state.table !== targetTable) {
      return { data: { id: "player-1" }, error: null };
    }
    if (this.state.table === "season_orgs" && this.state.op === "select") {
      return { data: { division_id: "solar" }, error: null };
    }
    if (this.state.table === "season_rosters" && this.state.op === "select") {
      const playerId = this.state.eqs.find(([column]) => column === "player_id");
      if (playerId) return { data: existingCaptainRow, error: null };
      return { data: orgCaptainRows, error: null };
    }
    if (this.state.table === targetTable) {
      if (this.state.op === "select") {
        if (recordState === "new") return { data: null, error: null };
        return { data: { deletion_scheduled_at: recordState === "scheduled" ? "2026-08-09T00:00:00Z" : null }, error: null };
      }
      if (this.state.op === "update" && recordState === "raced" && this.state.deletionScheduleMustBeNull) {
        return { data: [], error: null };
      }
      if (this.state.op === "update") return { data: [{ id: "record-1" }], error: null };
    }
    return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({ from: (table: string) => new FakeQuery(table) }),
}));

const player = {
  id: "player-1",
  discordUsername: "playerone",
  ign: "Player One",
  avatarInitials: "PO",
  avatarGradient: "from-cyan-500 to-blue-500",
  primaryRole: "Mid" as const,
  secondaryRoles: [],
  isStarter: false,
  isCaptain: false,
  status: "free-agent" as const,
};

const org = {
  id: "org-1",
  name: "Organization One",
  tag: "ORG",
  divisionId: "terra" as const,
  logoInitials: "ORG",
  logoGradient: "from-cyan-500 to-blue-500",
  primaryColor: "#22d3ee",
  accentGradient: "from-cyan-500 to-blue-500",
};

const match = {
  id: "match-1",
  divisionId: "terra" as const,
  homeOrgId: "org-1",
  awayOrgId: "org-2",
  scheduledDate: "2026-08-10",
  scheduledTime: "20:00",
  status: "scheduled" as const,
  week: 1,
  seasonId: "season-1",
};

describe("routine save pending-delete guards", () => {
  beforeEach(() => {
    vi.resetModules();
    executed = [];
    recordState = "active";
    existingCaptainRow = null;
    orgCaptainRows = [];
    failingAuditTable = null;
  });

  it.each([
    ["players", "savePlayer", player],
    ["orgs", "saveOrg", org],
    ["matches", "saveMatch", match],
  ] as const)("refuses to mutate a deletion-scheduled %s row", async (table, method, input) => {
    targetTable = table;
    recordState = "scheduled";
    const data = await import("./league-data");

    await expect(data[method](input as never)).rejects.toThrow("Cancel the scheduled deletion");

    expect(executed.some((query) => query.table === table && (query.op === "update" || query.op === "insert"))).toBe(false);
  });

  it.each([
    ["players", "savePlayer", player],
    ["orgs", "saveOrg", org],
  ] as const)("uses a conditional update for an existing %s row", async (table, method, input) => {
    targetTable = table;
    const data = await import("./league-data");

    await data[method](input as never);

    expect(executed).toContainEqual(expect.objectContaining({
      table,
      op: "update",
      deletionScheduleMustBeNull: true,
    }));
    expect(executed.some((query) => query.table === table && query.op === "insert")).toBe(false);
  });

  it.each([
    ["players", "savePlayer", player],
    ["orgs", "saveOrg", org],
  ] as const)("inserts a new %s row instead of upserting it", async (table, method, input) => {
    targetTable = table;
    recordState = "new";
    const data = await import("./league-data");

    await data[method](input as never);

    expect(executed).toContainEqual(expect.objectContaining({ table, op: "insert" }));
    expect(executed.some((query) => query.table === table && query.op === "update")).toBe(false);
  });

  it.each([
    ["players", "savePlayer", player],
    ["orgs", "saveOrg", org],
    ["matches", "saveMatch", match],
  ] as const)("fails closed when a %s row becomes deletion-scheduled during an update", async (table, method, input) => {
    targetTable = table;
    recordState = "raced";
    const data = await import("./league-data");

    await expect(data[method](input as never)).rejects.toThrow("changed concurrently");
  });

  it("rejects a player captain reassignment before writing without explicit confirmation", async () => {
    targetTable = "players";
    existingCaptainRow = { org_id: "org-1", division_id: "terra", is_captain: true };
    const { savePlayerForCurrentSeason } = await import("./league-data");

    await expect(savePlayerForCurrentSeason(player)).rejects.toThrow("requires explicit confirmation");

    expect(executed.some((query) => query.table === "players" && (query.op === "update" || query.op === "insert"))).toBe(false);
  });

  it("records the acting admin when a confirmed player captain reassignment succeeds", async () => {
    targetTable = "players";
    existingCaptainRow = { org_id: "org-1", division_id: "terra", is_captain: true };
    const { savePlayerForCurrentSeason } = await import("./league-data");

    await savePlayerForCurrentSeason(player, {
      confirmCaptainReassignment: true,
      actorDiscordId: "discord-admin-1",
    });

    expect(executed).toContainEqual(expect.objectContaining({
      table: "admin_audit_log",
      op: "insert",
      payload: expect.objectContaining({
        action: "captain_reassignment_confirmed",
        entity_type: "player",
        entity_id: "player-1",
        payload: expect.objectContaining({ actorDiscordId: "discord-admin-1" }),
      }),
    }));
    expect(executed).toContainEqual(expect.objectContaining({
      table: "audit_logs",
      op: "insert",
      payload: expect.objectContaining({
        action_type: "captain_reassignment_confirmed",
        actor_discord_id: "discord-admin-1",
        entity_type: "player",
        entity_id: "player-1",
      }),
    }));
  });

  it("preserves global org division and captain fields when editing one division team", async () => {
    targetTable = "orgs";
    orgCaptainRows = [{ player_id: "player-1" }];
    existingCaptainRow = { org_id: "org-1", division_id: "solar", is_captain: true };
    const { saveOrgForCurrentSeason } = await import("./league-data");

    await expect(saveOrgForCurrentSeason({ ...org, divisionId: "solar", captainId: "player-1" }, {
      confirmCaptainReassignment: true,
      actorDiscordId: "discord-admin-1",
    })).resolves.toBeUndefined();

    const orgUpdate = executed.find((query) => query.table === "orgs" && query.op === "update");
    expect(orgUpdate).toEqual(expect.objectContaining({
      table: "orgs",
      op: "update",
      deletionScheduleMustBeNull: true,
    }));
    expect(orgUpdate?.payload).toEqual(expect.objectContaining({ name: "Organization One", tag: "ORG" }));
    expect(orgUpdate?.payload).not.toHaveProperty("division_id");
    expect(orgUpdate?.payload).not.toHaveProperty("captain_id");
    expect(executed).toContainEqual(expect.objectContaining({
      table: "season_rosters",
      op: "select",
      eqs: expect.arrayContaining([["division_id", "solar"]]),
    }));
  });

  it("fails loudly when captain actor evidence cannot be persisted", async () => {
    targetTable = "players";
    existingCaptainRow = { org_id: "org-1", division_id: "terra", is_captain: true };
    failingAuditTable = "audit_logs";
    const { savePlayerForCurrentSeason } = await import("./league-data");

    await expect(savePlayerForCurrentSeason(player, {
      confirmCaptainReassignment: true,
      actorDiscordId: "discord-admin-1",
    })).rejects.toMatchObject({ message: "audit insert failed" });
  });

  it("propagates legacy admin audit insertion failures", async () => {
    failingAuditTable = "admin_audit_log";
    const { writeAuditLog } = await import("./league-data");

    await expect(writeAuditLog("test_action", "player", "player-1", {}))
      .rejects.toMatchObject({ message: "audit insert failed" });
  });
});
