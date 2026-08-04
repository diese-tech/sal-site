/**
 * Discord avatar capture write paths (register/claim/admin-approval).
 *
 * avatar_url isn't in the vendored database.types.ts yet (that file is a
 * strict content-hash match against diese-tech/sal-database — see
 * check:db-contract), so these write paths use a manual cast rather than
 * widening the generated types. This exercises the actual Supabase calls to
 * make sure the casts still produce the right payload/table/column targets.
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

  eq(column: string, value: unknown) {
    this.state.eqs.push([column, value]);
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

beforeEach(() => {
  vi.resetModules();
  executed = [];
  client = null;
});

describe("claimPlayerProfile avatar capture", () => {
  it("includes avatar_url in the players update when provided", async () => {
    client = makeClient(() => ({ data: null, error: null }));
    const { claimPlayerProfile } = await import("./league-data");

    await claimPlayerProfile("discord-1", "player-1", "https://cdn.discordapp.com/avatars/1/a.png");

    const update = executed.find((q) => q.table === "players" && q.op === "update");
    expect(update?.payload).toEqual({
      discord_id: "discord-1",
      profile_claimed: true,
      avatar_url: "https://cdn.discordapp.com/avatars/1/a.png",
    });
    expect(update?.eqs).toEqual([["id", "player-1"]]);
  });

  it("omits avatar_url entirely when not provided — never clears an existing avatar", async () => {
    client = makeClient(() => ({ data: null, error: null }));
    const { claimPlayerProfile } = await import("./league-data");

    await claimPlayerProfile("discord-1", "player-1");

    const update = executed.find((q) => q.table === "players" && q.op === "update");
    expect(update?.payload).toEqual({ discord_id: "discord-1", profile_claimed: true });
  });
});

describe("createRegistration avatar capture", () => {
  it("includes avatar_url in the registrations insert", async () => {
    client = makeClient(() => ({ data: null, error: null }));
    const { createRegistration } = await import("./league-data");

    await createRegistration({
      id: "reg-1",
      discordId: "discord-1",
      discordUsername: "brawler99",
      avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png",
      formData: {},
    });

    const insert = executed.find((q) => q.table === "registrations" && q.op === "insert");
    expect(insert?.payload).toMatchObject({ avatar_url: "https://cdn.discordapp.com/avatars/1/a.png" });
  });

  it("inserts a null avatar_url when the session had none", async () => {
    client = makeClient(() => ({ data: null, error: null }));
    const { createRegistration } = await import("./league-data");

    await createRegistration({ id: "reg-1", discordId: "discord-1", discordUsername: "brawler99", formData: {} });

    const insert = executed.find((q) => q.table === "registrations" && q.op === "insert");
    expect(insert?.payload).toMatchObject({ avatar_url: null });
  });
});

describe("copyRegistrationAvatarToPlayer", () => {
  it("copies the registration's stored avatar onto the player row", async () => {
    client = makeClient((query) => {
      if (query.table === "registrations") return { data: { avatar_url: "https://cdn.discordapp.com/avatars/1/a.png" }, error: null };
      return { data: null, error: null };
    });
    const { copyRegistrationAvatarToPlayer } = await import("./league-data");

    await copyRegistrationAvatarToPlayer("reg-1", "player-1");

    const update = executed.find((q) => q.table === "players" && q.op === "update");
    expect(update?.payload).toEqual({ avatar_url: "https://cdn.discordapp.com/avatars/1/a.png" });
    expect(update?.eqs).toEqual([["id", "player-1"]]);
  });

  it("does nothing when the registration has no stored avatar", async () => {
    client = makeClient(() => ({ data: { avatar_url: null }, error: null }));
    const { copyRegistrationAvatarToPlayer } = await import("./league-data");

    await copyRegistrationAvatarToPlayer("reg-1", "player-1");

    expect(executed.some((q) => q.table === "players")).toBe(false);
  });

  it("does nothing when Supabase isn't configured", async () => {
    client = null;
    const { copyRegistrationAvatarToPlayer } = await import("./league-data");

    await expect(copyRegistrationAvatarToPlayer("reg-1", "player-1")).resolves.toBeUndefined();
  });
});
