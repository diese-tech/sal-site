import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: vi.fn() }));
vi.mock("@/lib/draft-data", () => ({
  issueTeamAccessCode: vi.fn(),
  listTeamAccessCodes: vi.fn(),
  getDraftRoom: vi.fn(),
}));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/error-monitor", () => ({ reportError: vi.fn() }));

import { isAdminRequest } from "@/lib/admin-auth";
import { getDraftRoom, issueTeamAccessCode, listTeamAccessCodes } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { GET, POST } from "./route";

const ctx = { params: Promise.resolve({ id: "room-1" }) };
const room = {
  id: "room-1",
  baseOrder: ["org-a", "org-b"],
} as Awaited<ReturnType<typeof getDraftRoom>>;

function request(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/draft/room-1/tokens", {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function getRequest() {
  return new NextRequest("http://localhost/api/admin/draft/room-1/tokens");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAdminRequest).mockReturnValue(true);
  vi.mocked(getDraftRoom).mockResolvedValue(room);
  vi.mocked(listTeamAccessCodes).mockResolvedValue([]);
  vi.mocked(issueTeamAccessCode).mockImplementation(async (_roomId, orgId) => `CODE${orgId.slice(-1).toUpperCase()}123`);
});

describe("POST /api/admin/draft/[id]/tokens delegated access", () => {
  it("issues a team code only for the requested organization", async () => {
    const response = await POST(request({ orgId: "org-b" }), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ codes: { "org-b": "CODEB123" } });
    expect(issueTeamAccessCode).toHaveBeenCalledTimes(1);
    expect(issueTeamAccessCode).toHaveBeenCalledWith("room-1", "org-b");
    expect(writeAuditLog).toHaveBeenCalledWith(
      "draft_team_code_issued",
      "draft_room",
      "room-1",
      { orgCount: 1, orgId: "org-b", accessPurpose: "captain_or_org_owner" },
    );
  });

  it("rejects an organization that does not have a seat in the room", async () => {
    const response = await POST(request({ orgId: "org-c" }), ctx);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Organization is not in this draft room." });
    expect(issueTeamAccessCode).not.toHaveBeenCalled();
  });

  it("returns no code when persistence fails", async () => {
    vi.mocked(issueTeamAccessCode).mockRejectedValueOnce(new Error("insert failed"));

    const response = await POST(request({ orgId: "org-a" }), ctx);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to issue team code." });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("requires an admin session to issue delegated access", async () => {
    vi.mocked(isAdminRequest).mockReturnValue(false);

    const response = await POST(request({ orgId: "org-a" }), ctx);

    expect(response.status).toBe(401);
    expect(issueTeamAccessCode).not.toHaveBeenCalled();
  });

  it("issues a code for every seat when no organization is named", async () => {
    const response = await POST(request(), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      codes: { "org-a": "CODEA123", "org-b": "CODEB123" },
    });
    expect(issueTeamAccessCode).toHaveBeenCalledTimes(2);
  });

  it("reports which codes survived a mid-run failure instead of losing them", async () => {
    vi.mocked(issueTeamAccessCode)
      .mockResolvedValueOnce("CODEA123")
      .mockRejectedValueOnce(new Error("insert failed"));

    const response = await POST(request(), ctx);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to issue a code for org-b. Codes already issued in this run remain valid.",
      codes: { "org-a": "CODEA123" },
    });
  });

  it("refuses to issue codes before a pick order exists", async () => {
    vi.mocked(getDraftRoom).mockResolvedValue({ ...room!, baseOrder: [] });

    const response = await POST(request({ orgId: "org-a" }), ctx);

    expect(response.status).toBe(400);
    expect(issueTeamAccessCode).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/draft/[id]/tokens", () => {
  it("re-reads existing codes so an admin never has to rotate just to see one", async () => {
    vi.mocked(listTeamAccessCodes).mockResolvedValue([
      { orgId: "org-b", code: "H7K2QM4X", expiresAt: "2026-09-01T00:00:00Z", isLegacyLink: false },
    ]);

    const response = await GET(getRequest(), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      codes: [
        { orgId: "org-a", entry: null },
        { orgId: "org-b", entry: { orgId: "org-b", code: "H7K2QM4X", expiresAt: "2026-09-01T00:00:00Z", isLegacyLink: false } },
      ],
    });
    expect(issueTeamAccessCode).not.toHaveBeenCalled();
  });

  it("requires an admin session", async () => {
    vi.mocked(isAdminRequest).mockReturnValue(false);

    const response = await GET(getRequest(), ctx);

    expect(response.status).toBe(401);
    expect(listTeamAccessCodes).not.toHaveBeenCalled();
  });
});
