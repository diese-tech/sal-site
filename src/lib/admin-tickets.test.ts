import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getAdminTicketQueueFromClient } from "@/lib/admin-tickets";

type FakeResult = { data: unknown[] | null; error: { message: string; code?: string } | null };

/**
 * Minimal structural stand-in for the supabase query builder chain used by
 * the reader: from().select().order().limit() and from().select() awaited
 * directly for the name lookups.
 */
function fakeClient(results: Record<string, FakeResult | (() => Promise<FakeResult>)>) {
  return {
    from(table: string) {
      const resolve = async (): Promise<FakeResult> => {
        const result = results[table] ?? { data: [], error: null };
        return typeof result === "function" ? result() : result;
      };
      const thenable = {
        order: () => ({ limit: () => resolve() }),
        then: (onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
          resolve().then(onFulfilled, onRejected),
      };
      return { select: () => thenable };
    },
  } as unknown as SupabaseClient<Database>;
}

const registrationRow = {
  id: "cccc1111-0000-0000-0000-000000000001",
  status: "pending",
  created_at: "2026-07-03T10:00:00Z",
  reviewed_at: null,
  reviewer_note: null,
  season_id: "season-1",
  player_id: null,
  discord_username: "newplayer",
  discord_display_name: "New Player",
  form_data: { name: "Ada Vale" },
};

const matchReportRow = {
  id: "dddd1111-0000-0000-0000-000000000001",
  status: "review",
  created_at: "2026-07-04T10:00:00Z",
  reviewed_at: null,
  match_id: "mmmm2222-0000-0000-0000-000000000002",
  season_id: "season-1",
  division_id: "lunar",
  home_score: 2,
  away_score: 1,
  total_games: 3,
  screenshot_urls: [],
};

describe("getAdminTicketQueueFromClient", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports every source unavailable when the database is not configured", async () => {
    const queue = await getAdminTicketQueueFromClient(null);
    expect(queue.tickets).toEqual([]);
    expect(queue.sourceHealth).toHaveLength(4);
    expect(queue.sourceHealth.every((s) => !s.ok)).toBe(true);
    expect(queue.sourceHealth[0].reason).toBe("Database connection is not configured.");
  });

  it("normalizes rows from all sources and sorts the queue", async () => {
    const queue = await getAdminTicketQueueFromClient(
      fakeClient({
        registrations: { data: [registrationRow], error: null },
        match_reports: { data: [matchReportRow], error: null },
        pending_actions: { data: [], error: null },
        pending_stat_records: { data: [], error: null },
        seasons: { data: [{ id: "season-1", name: "Season One" }], error: null },
        divisions: { data: [{ id: "lunar", name: "Lunar" }], error: null },
      }),
    );
    expect(queue.tickets).toHaveLength(2);
    // The high-priority match report outranks the normal registration.
    expect(queue.tickets[0].category).toBe("match_report");
    expect(queue.sourceHealth.every((s) => s.ok)).toBe(true);
    expect(queue.seasonNames).toEqual({ "season-1": "Season One" });
    expect(queue.divisionNames).toEqual({ lunar: "Lunar" });
  });

  it("keeps the rest of the queue when one source fails", async () => {
    const queue = await getAdminTicketQueueFromClient(
      fakeClient({
        registrations: { data: null, error: { message: "permission denied", code: "42501" } },
        match_reports: { data: [matchReportRow], error: null },
        pending_actions: { data: [], error: null },
        pending_stat_records: { data: [], error: null },
      }),
    );
    expect(queue.tickets).toHaveLength(1);
    expect(queue.tickets[0].category).toBe("match_report");
    const registrationHealth = queue.sourceHealth.find((s) => s.source === "registration");
    expect(registrationHealth?.ok).toBe(false);
    expect(registrationHealth?.reason).toBe("Source unavailable, showing the rest of the queue.");
    expect(queue.sourceHealth.filter((s) => s.ok)).toHaveLength(3);
  });

  it("survives a source that rejects outright", async () => {
    const queue = await getAdminTicketQueueFromClient(
      fakeClient({
        pending_actions: () => Promise.reject(new Error("network down")),
        registrations: { data: [registrationRow], error: null },
      }),
    );
    expect(queue.tickets).toHaveLength(1);
    expect(queue.sourceHealth.find((s) => s.source === "operation")?.ok).toBe(false);
  });

  it("falls back to empty name maps when lookups fail without marking sources unhealthy", async () => {
    const queue = await getAdminTicketQueueFromClient(
      fakeClient({
        registrations: { data: [registrationRow], error: null },
        seasons: { data: null, error: { message: "nope" } },
        divisions: () => Promise.reject(new Error("boom")),
      }),
    );
    expect(queue.seasonNames).toEqual({});
    expect(queue.divisionNames).toEqual({});
    expect(queue.sourceHealth.every((s) => s.ok)).toBe(true);
  });

  it("logs failures without row contents", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await getAdminTicketQueueFromClient(
      fakeClient({
        registrations: { data: null, error: { message: "permission denied", code: "42501" } },
      }),
    );
    const logged = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("registration");
    expect(logged).toContain("permission denied");
    expect(logged).not.toContain("newplayer");
  });
});
