import { createHmac } from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  exchangeToken,
  getCaptainSeatsFromRequest,
  getCaptainSessionFromRequest,
  grantCaptainSeat,
  revokeCaptainSeat,
  signCaptainCookie,
  verifyCaptainCookie,
} from "./captain-auth";

vi.mock("@/lib/draft-data", () => ({
  redeemDraftAccess: vi.fn(),
}));

import { redeemDraftAccess } from "@/lib/draft-data";

const COOKIE = "sal_captain_session";
const TEST_SECRET = "test-captain-secret";

/** The pre-multi-seat cookie format: a single "roomId|orgId" pair. */
function legacyCookie(draftRoomId: string, orgId: string): string {
  const encoded = Buffer.from(`${draftRoomId}|${orgId}`).toString("base64url");
  const signature = createHmac("sha256", TEST_SECRET).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

function makeRequest(cookieValue?: string): NextRequest {
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set("cookie", `${COOKIE}=${cookieValue}`);
  }
  return new NextRequest("http://localhost/api/draft/test", { headers });
}

/** Minimal stand-in for NextResponse's cookie writer. */
function makeResponse() {
  const set = vi.fn();
  return { response: { cookies: { set } } as never, set };
}

const mockRedeem = vi.mocked(redeemDraftAccess);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CAPTAIN_SESSION_SECRET", TEST_SECRET);
});

describe("exchangeToken", () => {
  it("returns the seat when the code resolves", async () => {
    const session = { draftRoomId: "draft-room-1", orgId: "helix-reign" };
    mockRedeem.mockResolvedValue(session);
    expect(await exchangeToken("H7K2QM4X")).toEqual(session);
    expect(mockRedeem).toHaveBeenCalledWith("H7K2QM4X");
  });

  it("returns null for an unknown or expired code", async () => {
    mockRedeem.mockResolvedValue(null);
    expect(await exchangeToken("bad-code")).toBeNull();
  });

  it("propagates rejection from the data layer (unexpected DB error)", async () => {
    mockRedeem.mockRejectedValue(new Error("db error"));
    await expect(exchangeToken("any-code")).rejects.toThrow("db error");
  });
});

describe("getCaptainSessionFromRequest", () => {
  it("returns null when cookie is absent", () => {
    expect(getCaptainSessionFromRequest(makeRequest(), "draft-room-1")).toBeNull();
  });

  it("returns null when cookie is empty string", () => {
    expect(getCaptainSessionFromRequest(makeRequest(""), "draft-room-1")).toBeNull();
  });

  it("returns null when cookie has no dot separator (unsigned plain text)", () => {
    expect(getCaptainSessionFromRequest(makeRequest("nodraftroom"), "draft-room-1")).toBeNull();
  });

  it("returns null when cookie has no dot separator (old colon format)", () => {
    expect(getCaptainSessionFromRequest(makeRequest("draft-room-1:helix-reign"), "draft-room-1")).toBeNull();
  });

  it("parses a valid signed cookie for the requested room", () => {
    const cookie = signCaptainCookie({ "draft-room-1": "helix-reign" });
    expect(getCaptainSessionFromRequest(makeRequest(cookie), "draft-room-1")).toEqual({
      draftRoomId: "draft-room-1",
      orgId: "helix-reign",
    });
  });

  it("returns null for a room the browser holds no seat in", () => {
    const cookie = signCaptainCookie({ "draft-room-1": "helix-reign" });
    expect(getCaptainSessionFromRequest(makeRequest(cookie), "draft-room-2")).toBeNull();
  });

  it("returns null when signature is wrong (tampered cookie)", () => {
    const valid = signCaptainCookie({ "draft-room-1": "helix-reign" });
    const encoded = valid.slice(0, valid.lastIndexOf("."));
    expect(getCaptainSessionFromRequest(makeRequest(`${encoded}.badsignature`), "draft-room-1")).toBeNull();
  });

  it("returns null when payload is tampered even if format looks right", () => {
    const valid = signCaptainCookie({ "draft-room-1": "helix-reign" });
    const signature = valid.slice(valid.lastIndexOf(".") + 1);
    const tamperedEncoded = Buffer.from(JSON.stringify({ v: 2, seats: { "evil-room": "evil-org" } })).toString("base64url");
    expect(getCaptainSessionFromRequest(makeRequest(`${tamperedEncoded}.${signature}`), "evil-room")).toBeNull();
  });

  // Security fix for Bug #54: forged unsigned cookies are rejected.
  it("Bug #54 fix: rejects a forged unsigned draftRoomId:orgId cookie", () => {
    expect(getCaptainSessionFromRequest(makeRequest("any-room:any-org"), "any-room")).toBeNull();
  });
});

describe("multi-seat sessions", () => {
  it("holds seats in several rooms at once", () => {
    const cookie = signCaptainCookie({ "room-a": "org-a", "room-b": "org-b" });
    const request = makeRequest(cookie);
    expect(getCaptainSessionFromRequest(request, "room-a")?.orgId).toBe("org-a");
    expect(getCaptainSessionFromRequest(request, "room-b")?.orgId).toBe("org-b");
  });

  it("grantCaptainSeat keeps seats already held in other rooms", () => {
    const request = makeRequest(signCaptainCookie({ "room-a": "org-a" }));
    const { response, set } = makeResponse();

    grantCaptainSeat(response, getCaptainSeatsFromRequest(request), { draftRoomId: "room-b", orgId: "org-b" });

    const written = set.mock.calls[0]![1] as string;
    expect(verifyCaptainCookie(written)).toEqual({ "room-a": "org-a", "room-b": "org-b" });
  });

  it("re-joining a room replaces that seat in place", () => {
    const request = makeRequest(signCaptainCookie({ "room-a": "org-a" }));
    const { response, set } = makeResponse();

    grantCaptainSeat(response, getCaptainSeatsFromRequest(request), { draftRoomId: "room-a", orgId: "org-z" });

    expect(verifyCaptainCookie(set.mock.calls[0]![1] as string)).toEqual({ "room-a": "org-z" });
  });

  it("revokeCaptainSeat drops only the named room", () => {
    const request = makeRequest(signCaptainCookie({ "room-a": "org-a", "room-b": "org-b" }));
    const { response, set } = makeResponse();

    revokeCaptainSeat(response, getCaptainSeatsFromRequest(request), "room-a");

    expect(verifyCaptainCookie(set.mock.calls[0]![1] as string)).toEqual({ "room-b": "org-b" });
  });

  it("evicts the oldest seat past the cap instead of growing without bound", () => {
    const seats = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`room-${i}`, `org-${i}`]),
    );
    const held = verifyCaptainCookie(signCaptainCookie(seats));
    expect(Object.keys(held!)).toHaveLength(8);
    expect(held).not.toHaveProperty("room-0");
    expect(held).toHaveProperty("room-8");
  });

  it("sets an httpOnly, lax, root-path cookie", () => {
    const { response, set } = makeResponse();
    grantCaptainSeat(response, {}, { draftRoomId: "room-a", orgId: "org-a" });

    expect(set.mock.calls[0]![2]).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});

describe("legacy v1 cookie compatibility", () => {
  it("still resolves a session issued before multi-seat cookies", () => {
    expect(getCaptainSessionFromRequest(makeRequest(legacyCookie("draft-room-1", "helix-reign")), "draft-room-1")).toEqual({
      draftRoomId: "draft-room-1",
      orgId: "helix-reign",
    });
  });

  it("returns null when draftRoomId is empty in a signed legacy cookie", () => {
    expect(verifyCaptainCookie(legacyCookie("", "helix-reign"))).toBeNull();
  });

  it("returns null when orgId is empty in a signed legacy cookie", () => {
    expect(verifyCaptainCookie(legacyCookie("draft-room-1", ""))).toBeNull();
  });

  it("upgrades a legacy cookie to the multi-seat format on the next join", () => {
    const request = makeRequest(legacyCookie("room-a", "org-a"));
    const { response, set } = makeResponse();

    grantCaptainSeat(response, getCaptainSeatsFromRequest(request), { draftRoomId: "room-b", orgId: "org-b" });

    expect(verifyCaptainCookie(set.mock.calls[0]![1] as string)).toEqual({ "room-a": "org-a", "room-b": "org-b" });
  });
});
