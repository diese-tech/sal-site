import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  getHostReviewSessionFromRequest,
  setHostReviewSessionCookie,
} from "./auth";

const reportId = "11111111-1111-4111-8111-111111111111";

describe("match report host session", () => {
  beforeEach(() => {
    process.env.MATCH_REPORT_HOST_SESSION_SECRET = "test-secret-with-at-least-thirty-two-characters";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.MATCH_REPORT_HOST_SESSION_SECRET;
  });

  it("round-trips a signed cookie only for its scoped report", () => {
    const response = NextResponse.json({ ok: true });
    setHostReviewSessionCookie(response, {
      matchReportId: reportId,
      hostDiscordId: "discord-host-1",
    });
    const cookie = response.cookies.get("sal_match_report_host_session");
    expect(cookie?.path).toBe(`/api/match-reports/${reportId}`);

    const request = new NextRequest(`https://sal.example/api/match-reports/${reportId}`, {
      headers: { cookie: `sal_match_report_host_session=${cookie?.value}` },
    });
    expect(getHostReviewSessionFromRequest(request, reportId)).toMatchObject({
      matchReportId: reportId,
      hostDiscordId: "discord-host-1",
    });
    expect(
      getHostReviewSessionFromRequest(
        request,
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toBeNull();
  });

  it("rejects tampered and expired cookies", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    const response = NextResponse.json({ ok: true });
    setHostReviewSessionCookie(response, {
      matchReportId: reportId,
      hostDiscordId: "discord-host-1",
    });
    const value = response.cookies.get("sal_match_report_host_session")!.value;
    const requestFor = (cookieValue: string) => new NextRequest(
      `https://sal.example/api/match-reports/${reportId}`,
      { headers: { cookie: `sal_match_report_host_session=${cookieValue}` } },
    );

    expect(getHostReviewSessionFromRequest(requestFor(`${value}x`), reportId)).toBeNull();
    vi.setSystemTime(new Date("2026-08-18T18:00:01.000Z"));
    expect(getHostReviewSessionFromRequest(requestFor(value), reportId)).toBeNull();
  });

  it("fails closed instead of throwing when the dedicated secret is missing", () => {
    delete process.env.MATCH_REPORT_HOST_SESSION_SECRET;
    const request = new NextRequest(`https://sal.example/api/match-reports/${reportId}`, {
      headers: { cookie: "sal_match_report_host_session=untrusted.payload" },
    });

    expect(() => getHostReviewSessionFromRequest(request, reportId)).not.toThrow();
    expect(getHostReviewSessionFromRequest(request, reportId)).toBeNull();
  });
});
