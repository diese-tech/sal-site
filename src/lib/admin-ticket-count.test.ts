import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
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
    vi.unstubAllEnvs();
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
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    await expect(getUnresolvedAdminTicketCount()).resolves.toBeNull();
  });
});
