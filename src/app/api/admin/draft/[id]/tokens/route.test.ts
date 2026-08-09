import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: vi.fn() }));
vi.mock("@/lib/draft-data", () => ({
  generateCaptainToken: vi.fn(),
  getDraftRoom: vi.fn(),
}));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/error-monitor", () => ({ reportError: vi.fn() }));

import { isAdminRequest } from "@/lib/admin-auth";
import { generateCaptainToken, getDraftRoom } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { POST } from "./route";

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

describe("POST /api/admin/draft/[id]/tokens delegated access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminRequest).mockReturnValue(true);
    vi.mocked(getDraftRoom).mockResolvedValue(room);
    vi.mocked(generateCaptainToken).mockImplementation(async (_roomId, orgId) => `token-${orgId}`);
  });

  it("issues a one-time access link only for the requested organization", async () => {
    const response = await POST(request({ orgId: "org-b" }), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tokens: { "org-b": "token-org-b" } });
    expect(generateCaptainToken).toHaveBeenCalledTimes(1);
    expect(generateCaptainToken).toHaveBeenCalledWith("room-1", "org-b");
    expect(writeAuditLog).toHaveBeenCalledWith(
      "draft_delegate_token_generated",
      "draft_room",
      "room-1",
      { orgCount: 1, orgId: "org-b", accessPurpose: "captain_or_org_owner" },
    );
  });

  it("rejects an organization that does not have a seat in the room", async () => {
    const response = await POST(request({ orgId: "org-c" }), ctx);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Organization is not in this draft room." });
    expect(generateCaptainToken).not.toHaveBeenCalled();
  });

  it("returns no access token when persistence fails", async () => {
    vi.mocked(generateCaptainToken).mockRejectedValueOnce(new Error("insert failed"));

    const response = await POST(request({ orgId: "org-a" }), ctx);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to generate access link." });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("requires an admin session to issue delegated access", async () => {
    vi.mocked(isAdminRequest).mockReturnValue(false);

    const response = await POST(request({ orgId: "org-a" }), ctx);

    expect(response.status).toBe(401);
    expect(generateCaptainToken).not.toHaveBeenCalled();
  });

  it("preserves the legacy all-seat token action for current clients", async () => {
    const response = await POST(request(), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tokens: { "org-a": "token-org-a", "org-b": "token-org-b" },
    });
    expect(generateCaptainToken).toHaveBeenCalledTimes(2);
  });
});
