import { createHmac } from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getCaptainSessionFromRequest, exchangeToken } from "./captain-auth";

vi.mock("@/lib/draft-data", () => ({
  consumeCaptainToken: vi.fn(),
}));

import { consumeCaptainToken } from "@/lib/draft-data";

const COOKIE = "sal_captain_session";
const TEST_SECRET = "test-captain-secret";

function signedCookie(draftRoomId: string, orgId: string): string {
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

const mockVerify = vi.mocked(consumeCaptainToken);

describe("exchangeToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CAPTAIN_SESSION_SECRET", TEST_SECRET);
  });

  it("returns the session when consumeCaptainToken resolves a valid session", async () => {
    const session = { draftRoomId: "draft-room-1", orgId: "helix-reign" };
    mockVerify.mockResolvedValue(session);
    expect(await exchangeToken("valid-token")).toEqual(session);
    expect(mockVerify).toHaveBeenCalledWith("valid-token");
  });

  it("returns null when consumeCaptainToken returns null (invalid token)", async () => {
    mockVerify.mockResolvedValue(null);
    expect(await exchangeToken("bad-token")).toBeNull();
  });

  it("returns null when consumeCaptainToken returns null (expired token)", async () => {
    mockVerify.mockResolvedValue(null);
    expect(await exchangeToken("expired-token")).toBeNull();
  });

  it("propagates rejection from consumeCaptainToken (unexpected DB error)", async () => {
    mockVerify.mockRejectedValue(new Error("db error"));
    await expect(exchangeToken("any-token")).rejects.toThrow("db error");
  });
});

describe("getCaptainSessionFromRequest", () => {
  beforeEach(() => {
    vi.stubEnv("CAPTAIN_SESSION_SECRET", TEST_SECRET);
  });

  it("returns null when cookie is absent", () => {
    expect(getCaptainSessionFromRequest(makeRequest())).toBeNull();
  });

  it("returns null when cookie is empty string", () => {
    expect(getCaptainSessionFromRequest(makeRequest(""))).toBeNull();
  });

  it("returns null when cookie has no dot separator (unsigned plain text)", () => {
    expect(getCaptainSessionFromRequest(makeRequest("nodraftroom"))).toBeNull();
  });

  it("returns null when cookie has no dot separator (old colon format)", () => {
    expect(getCaptainSessionFromRequest(makeRequest("draft-room-1:helix-reign"))).toBeNull();
  });

  it("returns null when draftRoomId is empty in a signed cookie", () => {
    // signed cookie where payload decodes to "|orgId"
    expect(getCaptainSessionFromRequest(makeRequest(signedCookie("", "helix-reign")))).toBeNull();
  });

  it("returns null when orgId is empty in a signed cookie", () => {
    // signed cookie where payload decodes to "draftRoomId|"
    expect(getCaptainSessionFromRequest(makeRequest(signedCookie("draft-room-1", "")))).toBeNull();
  });

  it("parses a valid signed cookie", () => {
    const session = getCaptainSessionFromRequest(makeRequest(signedCookie("draft-room-1", "helix-reign")));
    expect(session).toEqual({ draftRoomId: "draft-room-1", orgId: "helix-reign" });
  });

  it("returns null when signature is wrong (tampered cookie)", () => {
    const valid = signedCookie("draft-room-1", "helix-reign");
    const [encoded] = valid.split(".");
    const tampered = `${encoded}.badsignature`;
    expect(getCaptainSessionFromRequest(makeRequest(tampered))).toBeNull();
  });

  it("returns null when payload is tampered even if format looks right", () => {
    const valid = signedCookie("draft-room-1", "helix-reign");
    const [, signature] = valid.split(".");
    // Change the payload to a different room
    const tamperedEncoded = Buffer.from("evil-room|evil-org").toString("base64url");
    const tampered = `${tamperedEncoded}.${signature}`;
    expect(getCaptainSessionFromRequest(makeRequest(tampered))).toBeNull();
  });

  // Security fix for Bug #54: forged unsigned cookies are now rejected.
  it("Bug #54 fix: rejects a forged unsigned draftRoomId:orgId cookie", () => {
    const forged = getCaptainSessionFromRequest(makeRequest("any-room:any-org"));
    // The unsigned/unverified cookie must now return null.
    expect(forged).toBeNull();
  });
});
