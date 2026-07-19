import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BugReportStatusReader } from "@/lib/bug-reports/persistence";
import {
  createBugReportStatusHandler as createHandler,
  type BugReportStatusDependencies,
} from "./route";

const canonicalSiteOrigin = "https://sal.example";
const publicTicketId = `public_${"p".repeat(32)}`;
const anonymousAccessToken = `token_${"a".repeat(43)}`;
const routeContext = { params: Promise.resolve({ publicTicketId }) };

function createBugReportStatusHandler(
  dependencies: Omit<BugReportStatusDependencies, "canonicalSiteOrigin">,
) {
  return createHandler({ ...dependencies, canonicalSiteOrigin });
}

function requestFor(body: unknown = { accessToken: anonymousAccessToken }) {
  return new NextRequest(
    `https://sal.example/api/bug-reports/tickets/${publicTicketId}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const status = {
  ticketId: "BUG-0200",
  status: "investigating" as const,
  updatedAt: "2026-07-19T05:00:00.000Z",
  messages: [
    {
      id: "message-1",
      direction: "admin_to_reporter" as const,
      message: "We are checking the standings data now.",
      deliveryStatus: "delivered" as const,
      createdAt: "2026-07-19T04:58:00.000Z",
    },
  ],
};

describe("POST /api/bug-reports/tickets/[publicTicketId]", () => {
  it("fails closed when the durable status reader is unavailable", async () => {
    const handler = createBugReportStatusHandler({
      statusReader: null,
      resolveReporter: vi.fn(),
    });

    const response = await handler(requestFor(), routeContext);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "persistence_unavailable",
    });
  });

  it("sends an anonymous fragment secret only to the status adapter", async () => {
    const read = vi.fn().mockResolvedValue(status);
    const resolveReporter = vi.fn();
    const handler = createBugReportStatusHandler({
      statusReader: { read } as BugReportStatusReader,
      resolveReporter,
    });

    const response = await handler(requestFor(), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    await expect(response.json()).resolves.toEqual({ ok: true, ticket: status });
    expect(read).toHaveBeenCalledWith({
      publicTicketId,
      access: { kind: "anonymous", accessToken: anonymousAccessToken },
    });
    expect(resolveReporter).not.toHaveBeenCalled();
  });

  it("uses the signed-in session without putting identity in the request body", async () => {
    const read = vi.fn().mockResolvedValue(status);
    const handler = createBugReportStatusHandler({
      statusReader: { read } as BugReportStatusReader,
      resolveReporter: async () => ({
        kind: "signed_in",
        authUserId: "auth-user-1",
        discordId: "discord-user-1",
      }),
    });

    const response = await handler(requestFor({}), routeContext);

    expect(response.status).toBe(200);
    expect(read).toHaveBeenCalledWith({
      publicTicketId,
      access: {
        kind: "signed_in",
        authUserId: "auth-user-1",
        discordId: "discord-user-1",
      },
    });
  });

  it("does not reveal whether a ticket exists to an unauthenticated caller", async () => {
    const read = vi.fn();
    const handler = createBugReportStatusHandler({
      statusReader: { read } as BugReportStatusReader,
      resolveReporter: async () => ({ kind: "anonymous" }),
    });

    const response = await handler(requestFor({}), routeContext);

    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects invalid adapter output instead of leaking it", async () => {
    const read = vi.fn().mockResolvedValue({
      ...status,
      internalReporterDiscordId: "do-not-leak",
    });
    const handler = createBugReportStatusHandler({
      statusReader: { read } as BugReportStatusReader,
      resolveReporter: vi.fn(),
    });

    const response = await handler(requestFor(), routeContext);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).not.toContain("internalReporterDiscordId");
    expect(serialized).not.toContain("do-not-leak");
  });
});
