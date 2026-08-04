import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: vi.fn(() => true) }));
vi.mock("@/lib/draft-data", () => ({
  buildDraftState: vi.fn(),
  updateDraftRoom: vi.fn(),
}));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));

import { buildDraftState, updateDraftRoom } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { POST } from "./route";

const state = {
  room: {
    id: "preseason-s2-solar-draft",
    seasonId: "preseason-s2",
    divisionId: "solar",
    status: "pending",
    baseOrder: ["org-baba"],
  },
} as Awaited<ReturnType<typeof buildDraftState>>;

const ctx = { params: Promise.resolve({ id: "preseason-s2-solar-draft" }) };

function queryResult(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
}

describe("POST /api/admin/draft/[id]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildDraftState).mockResolvedValue(state);
    vi.mocked(updateDraftRoom).mockResolvedValue({ ...state!.room, status: "active" } as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);
  });

  it("starts when every saved organization is enrolled in this season division", async () => {
    const seasonTeams = queryResult({
      data: [{ org_id: "org-baba", division_id: "solar", status: "active" }],
      error: null,
    });
    const organizations = queryResult({
      data: [{ id: "org-baba", name: "Baba's Kitchen" }],
      error: null,
    });
    const from = vi.fn((table: string) => table === "season_orgs" ? seasonTeams : organizations);
    vi.mocked(getSupabaseServerClient).mockReturnValue({ from } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/admin/draft/preseason-s2-solar-draft/start", { method: "POST" }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("season_orgs");
    expect(updateDraftRoom).toHaveBeenCalledWith(
      "preseason-s2-solar-draft",
      expect.objectContaining({ status: "active", currentPickIndex: 0 }),
    );
  });

  it("returns readable team names without leaking saved IDs for a cross-division order", async () => {
    const seasonTeams = queryResult({
      data: [{ org_id: "org-baba", division_id: "lunar", status: "active" }],
      error: null,
    });
    const organizations = queryResult({
      data: [{ id: "org-baba", name: "Baba's Kitchen" }],
      error: null,
    });
    vi.mocked(getSupabaseServerClient).mockReturnValue({
      from: vi.fn((table: string) => table === "season_orgs" ? seasonTeams : organizations),
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/admin/draft/preseason-s2-solar-draft/start", { method: "POST" }),
      ctx,
    );

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toBe(
      "Some teams in the saved pick order do not belong to the Solar Division. Remove or replace them before starting the draft. Affected teams: Baba's Kitchen - LD.",
    );
    expect(body.error).not.toContain("baseOrder");
    expect(body.error).not.toContain("org-baba");
    expect(body.error).not.toContain('"solar"');
    expect(updateDraftRoom).not.toHaveBeenCalled();
  });
});
