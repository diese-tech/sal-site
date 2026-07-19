import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMatchReportActionContextHandler } from "./route";

const request = new NextRequest(
  "https://sal.example/api/admin/tickets/match-reports/report-1",
);
const routeContext = { params: Promise.resolve({ id: "report-1" }) };

describe("GET /api/admin/tickets/match-reports/[id]", () => {
  it("rejects callers without an admin session before loading report data", async () => {
    const loadContext = vi.fn();
    const handler = createMatchReportActionContextHandler({
      isAuthorized: () => false,
      loadContext,
    });

    const response = await handler(request, routeContext);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(loadContext).not.toHaveBeenCalled();
  });

  it("returns only the narrow review context to an authorized admin", async () => {
    const actionContext = {
      kind: "resolvable" as const,
      reportId: "report-1",
      matchId: "match-1",
      homeOrg: { name: "Home Team", tag: "HOME" },
      awayOrg: { name: "Away Team", tag: "AWAY" },
      screenshotLinks: [],
      games: [
        {
          gameNumber: 1,
          winningSide: "home" as const,
          players: [
            { playerIgn: "Home", side: "home" as const, won: true, kills: 2, deaths: 0, assists: 1 },
            { playerIgn: "Away", side: "away" as const, won: false, kills: 0, deaths: 2, assists: 1 },
          ],
        },
      ],
    };
    const handler = createMatchReportActionContextHandler({
      isAuthorized: () => true,
      loadContext: vi.fn().mockResolvedValue(actionContext),
    });

    const response = await handler(request, routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ context: actionContext });
  });

  it("fails closed instead of serializing an unexpected identity field", async () => {
    const handler = createMatchReportActionContextHandler({
      isAuthorized: () => true,
      loadContext: vi.fn().mockResolvedValue({
        kind: "read_only",
        reason: "Continue in Match Report.",
        workflowHref: "/admin/match-report",
        submittedBy: "private-discord-id",
      } as never),
    });

    const response = await handler(request, routeContext);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).not.toContain("private-discord-id");
    expect(serialized).not.toContain("submittedBy");
  });
});
