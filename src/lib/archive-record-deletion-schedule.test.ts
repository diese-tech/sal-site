import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryState = {
  table: string;
  op: "select" | "update";
  payload?: unknown;
  deletionScheduleMustBeNull?: boolean;
};

type QueryResult = { data: unknown; error: { message: string } | null };

class FakeQuery {
  private state: QueryState;

  constructor(
    table: string,
    private readonly scheduledTable: string,
    private readonly executed: QueryState[],
  ) {
    this.state = { table, op: "select" };
  }

  select() { return this; }
  eq() { return this; }
  is(column: string, value: unknown) {
    if (column === "deletion_scheduled_at" && value === null) this.state.deletionScheduleMustBeNull = true;
    return this;
  }
  in() { return this; }
  limit() { return this; }

  update(payload: unknown) {
    this.state.op = "update";
    this.state.payload = payload;
    return this;
  }

  single() { return this.execute(); }
  maybeSingle() { return this.execute(); }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    this.executed.push({ ...this.state });
    if (this.state.table === this.scheduledTable && this.state.op === "update" && this.state.deletionScheduleMustBeNull) {
      return { data: [], error: null };
    }
    if (this.state.table === this.scheduledTable) {
      return { data: { deletion_scheduled_at: "2026-08-09T00:00:00Z" }, error: null };
    }
    return { data: null, error: null };
  }
}

let scheduledTable = "";
let executed: QueryState[] = [];

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => new FakeQuery(table, scheduledTable, executed),
  }),
}));

describe("archive state and scheduled deletion", () => {
  beforeEach(() => {
    vi.resetModules();
    executed = [];
  });

  it.each([
    ["players", "player-1"],
    ["orgs", "org-1"],
    ["matches", "match-1"],
  ] as const)("refuses to archive a deletion-scheduled %s record", async (table, id) => {
    scheduledTable = table;
    const { archiveRecord } = await import("./league-data");

    await expect(archiveRecord(table, id))
      .rejects.toThrow("Cancel the scheduled deletion through the superadmin pending-delete flow");

    expect(executed).toContainEqual(expect.objectContaining({
      table,
      op: "update",
      deletionScheduleMustBeNull: true,
    }));
  });

  it.each([
    ["players", "player-1"],
    ["orgs", "org-1"],
    ["matches", "match-1"],
  ] as const)("refuses to restore a deletion-scheduled %s record", async (table, id) => {
    scheduledTable = table;
    const { unarchiveRecord } = await import("./league-data");

    await expect(unarchiveRecord(table, id))
      .rejects.toThrow("Cancel the scheduled deletion through the superadmin pending-delete flow");

    expect(executed).toContainEqual(expect.objectContaining({
      table,
      op: "update",
      deletionScheduleMustBeNull: true,
    }));
  });
});
