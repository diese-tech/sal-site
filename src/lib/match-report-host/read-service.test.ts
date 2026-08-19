import { describe, expect, it, vi } from "vitest";
import { loadActiveRosterPlayers, readExtractionDiagnostics } from "./read-service";

describe("host review diagnostics read", () => {
  it("opens a brand-new report without calling the diagnostics RPC with zero games", async () => {
    const rpc = vi.fn();

    await expect(readExtractionDiagnostics(rpc, "report-1", [])).resolves.toEqual({
      gameCount: 0,
      duplicateIgns: [],
      unlinkedIgns: [],
      ambiguousIgns: [],
      games: [],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps an incomplete OCR draft recoverable without invoking strict diagnostics", async () => {
    const rpc = vi.fn();
    const games = [{ gameNumber: 1, winningSide: "unknown" as const, players: [] }];

    await expect(readExtractionDiagnostics(rpc, "report-1", games)).resolves.toMatchObject({
      gameCount: 1,
      games: [],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("only loads active, non-deleting roster identities offered by the host UI", async () => {
    const calls: Array<[string, unknown]> = [];
    const query = {
      select(columns: string) { calls.push(["select", columns]); return this; },
      in(column: string, values: unknown) { calls.push([`in:${column}`, values]); return this; },
      is(column: string, value: unknown) { calls.push([`is:${column}`, value]); return this; },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: [{ id: "db02-home-1", ign: "Home One" }], error: null }).then(resolve);
      },
    };
    const client = { from: vi.fn(() => query) };

    await expect(loadActiveRosterPlayers(client, ["db02-home-1"])).resolves.toEqual([
      { id: "db02-home-1", ign: "Home One" },
    ]);
    expect(calls).toContainEqual(["is:archived_at", null]);
    expect(calls).toContainEqual(["is:deletion_scheduled_at", null]);
  });
});
