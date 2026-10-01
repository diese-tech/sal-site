import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/draft-data", () => ({ redeemDraftAccess: vi.fn() }));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/error-monitor", () => ({ reportError: vi.fn() }));

import { redeemDraftAccess } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { clearRateLimit } from "@/lib/rate-limit";
import { verifyCaptainCookie } from "@/lib/captain-auth";
import { DELETE, POST } from "./route";

const ctx = { params: Promise.resolve({ id: "room-1" }) };
const TEST_IPS = ["1.2.3.4", "5.6.7.8", "9.9.9.9"];

function joinRequest(body: unknown, { ip = "1.2.3.4", cookie }: { ip?: string; cookie?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json", "x-forwarded-for": ip });
  if (cookie) headers.set("cookie", `sal_captain_session=${cookie}`);
  return new NextRequest("http://localhost/api/draft/room-1/join", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Read the seat cookie a response wrote. */
function seatsFromResponse(response: Response) {
  const setCookie = response.headers.get("set-cookie")!;
  const value = decodeURIComponent(setCookie.split(";")[0]!.split("=").slice(1).join("="));
  return verifyCaptainCookie(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const ip of TEST_IPS) clearRateLimit(`draft-join:room-1:${ip}`);
  vi.stubEnv("CAPTAIN_SESSION_SECRET", "test-captain-secret");
});

describe("POST /api/draft/[id]/join", () => {
  it("grants the seat and sets a session cookie for a valid code", async () => {
    vi.mocked(redeemDraftAccess).mockResolvedValue({ draftRoomId: "room-1", orgId: "org-a" });

    const response = await POST(joinRequest({ code: "H7K2QM4X" }), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, orgId: "org-a" });
    expect(seatsFromResponse(response)).toEqual({ "room-1": "org-a" });
    expect(writeAuditLog).toHaveBeenCalledWith("draft_seat_joined", "draft_room", "room-1", {
      draftRoomId: "room-1",
      orgId: "org-a",
    });
  });

  it("is reusable — the same code works again for a second device", async () => {
    vi.mocked(redeemDraftAccess).mockResolvedValue({ draftRoomId: "room-1", orgId: "org-a" });

    const first = await POST(joinRequest({ code: "H7K2QM4X" }), ctx);
    const second = await POST(joinRequest({ code: "H7K2QM4X", }, { ip: "5.6.7.8" }), ctx);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(seatsFromResponse(second)).toEqual({ "room-1": "org-a" });
  });

  it("rejects a code issued for a different draft room", async () => {
    vi.mocked(redeemDraftAccess).mockResolvedValue({ draftRoomId: "room-2", orgId: "org-a" });

    const response = await POST(joinRequest({ code: "H7K2QM4X" }), ctx);

    expect(response.status).toBe(401);
    expect(writeAuditLog).toHaveBeenCalledWith(
      "draft_join_failed",
      "draft_room",
      "room-1",
      expect.objectContaining({ reason: "code_belongs_to_another_room" }),
    );
  });

  it("rejects an unknown code and audits the attempt", async () => {
    vi.mocked(redeemDraftAccess).mockResolvedValue(null);

    const response = await POST(joinRequest({ code: "BADBAD11" }), ctx);

    expect(response.status).toBe(401);
    expect(writeAuditLog).toHaveBeenCalledWith(
      "draft_join_failed",
      "draft_room",
      "room-1",
      expect.objectContaining({ reason: "unknown_or_expired_code" }),
    );
  });

  it("requires a code in the body", async () => {
    const response = await POST(joinRequest({}), ctx);

    expect(response.status).toBe(400);
    expect(redeemDraftAccess).not.toHaveBeenCalled();
  });

  it("throttles brute-force guessing per client", async () => {
    vi.mocked(redeemDraftAccess).mockResolvedValue(null);

    for (let i = 0; i < 10; i++) {
      expect((await POST(joinRequest({ code: `GUESS${i}A` }), ctx)).status).toBe(401);
    }

    const blocked = await POST(joinRequest({ code: "GUESS99A" }), ctx);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("does not throttle a different client", async () => {
    vi.mocked(redeemDraftAccess).mockResolvedValue(null);
    for (let i = 0; i < 10; i++) await POST(joinRequest({ code: `GUESS${i}A` }), ctx);

    vi.mocked(redeemDraftAccess).mockResolvedValue({ draftRoomId: "room-1", orgId: "org-a" });
    const other = await POST(joinRequest({ code: "H7K2QM4X" }, { ip: "9.9.9.9" }), ctx);

    expect(other.status).toBe(200);
  });

  it("clears the throttle once the captain gets their code right", async () => {
    vi.mocked(redeemDraftAccess).mockResolvedValue(null);
    for (let i = 0; i < 9; i++) await POST(joinRequest({ code: `GUESS${i}A` }), ctx);

    vi.mocked(redeemDraftAccess).mockResolvedValue({ draftRoomId: "room-1", orgId: "org-a" });
    expect((await POST(joinRequest({ code: "H7K2QM4X" }), ctx)).status).toBe(200);

    vi.mocked(redeemDraftAccess).mockResolvedValue(null);
    // Would have been the 11th attempt and blocked had the success not reset it.
    expect((await POST(joinRequest({ code: "NOPE1234" }), ctx)).status).toBe(401);
  });
});

describe("DELETE /api/draft/[id]/join", () => {
  it("releases this room's seat", async () => {
    const response = await DELETE(joinRequest({}), ctx);

    expect(response.status).toBe(200);
    expect(seatsFromResponse(response)).toBeNull();
  });
});

describe("audit resilience", () => {
  it("still grants the seat when the audit write fails", async () => {
    vi.mocked(redeemDraftAccess).mockResolvedValue({ draftRoomId: "room-1", orgId: "org-a" });
    vi.mocked(writeAuditLog).mockRejectedValueOnce(new Error("audit table unavailable"));

    const response = await POST(joinRequest({ code: "H7K2QM4X" }), ctx);

    expect(response.status).toBe(200);
    expect(seatsFromResponse(response)).toEqual({ "room-1": "org-a" });
  });
});
