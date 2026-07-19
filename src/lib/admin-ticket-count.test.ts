import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));

import {
  getUnresolvedAdminTicketCount,
  getUnresolvedAdminTicketCountFromClient,
} from "@/lib/admin-ticket-count";

type FakeCountResult = {
  count: number | null;
  error: { message: string; code?: string } | null;
};

function fakeClient(results: Record<string, FakeCountResult>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            not() {
              return Promise.resolve(results[table] ?? { count: 0, error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe("getUnresolvedAdminTicketCountFromClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.getSupabaseServerClient.mockReset();
  });

  it("returns the unresolved total across every current ticket source", async () => {
    const count = await getUnresolvedAdminTicketCountFromClient(
      fakeClient({
        pending_actions: { count: 2, error: null },
        pending_stat_records: { count: 3, error: null },
        registrations: { count: 5, error: null },
        match_reports: { count: 7, error: null },
      }),
    );

    expect(count).toBe(17);
  });

  it("omits the count when any ticket source is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const count = await getUnresolvedAdminTicketCountFromClient(
      fakeClient({
        pending_actions: { count: 2, error: null },
        pending_stat_records: { count: 3, error: null },
        registrations: {
          count: null,
          error: { message: "permission denied", code: "42501" },
        },
        match_reports: { count: 7, error: null },
      }),
    );

    expect(count).toBeNull();
  });

  it("omits the count when Supabase is not configured", async () => {
    mocks.getSupabaseServerClient.mockReturnValue(null);

    await expect(getUnresolvedAdminTicketCount()).resolves.toBeNull();
    expect(mocks.getSupabaseServerClient).toHaveBeenCalledOnce();
  });
});
