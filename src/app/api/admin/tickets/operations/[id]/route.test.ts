import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createOperationResolutionHandler } from "./route";

const context = { params: Promise.resolve({ id: "action-1" }) };

function request(body: unknown) {
  return new NextRequest("https://sal.example/api/admin/tickets/operations/action-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/tickets/operations/[id]", () => {
  it("rejects unauthenticated and password-only sessions before database access", async () => {
    for (const session of [null, { discordId: "password-admin" }]) {
      const resolveOperation = vi.fn();
      const handler = createOperationResolutionHandler({
        getSession: () => session,
        resolveOperation,
      });

      const response = await handler(request({ decision: "approve" }), context);

      expect(response.status).toBe(session ? 403 : 401);
      expect(resolveOperation).not.toHaveBeenCalled();
    }
  });

  it("requires notes for denial and Needs Info", async () => {
    const resolveOperation = vi.fn();
    const handler = createOperationResolutionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveOperation,
    });

    for (const decision of ["deny", "needs_info"]) {
      const response = await handler(request({ decision, note: "  " }), context);
      expect(response.status).toBe(400);
    }
    expect(resolveOperation).not.toHaveBeenCalled();
  });

  it("maps an audited decision to the canonical RPC adapter", async () => {
    const resolveOperation = vi.fn().mockResolvedValue({
      code: "applied",
      actionId: "action-1",
      actionType: "admin_review",
      finalStatus: "approved",
      applied: true,
    });
    const handler = createOperationResolutionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveOperation,
    });

    const response = await handler(
      request({ decision: "approve", note: "Evidence verified." }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, status: "approved" });
    expect(resolveOperation).toHaveBeenCalledWith({
      actionId: "action-1",
      actorDiscordId: "admin-1",
      decision: "approve",
      note: "Evidence verified.",
    });
  });

  it("fails closed on an invalid database result", async () => {
    const handler = createOperationResolutionHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveOperation: vi.fn().mockResolvedValue({ status: "approved" }),
    });

    const response = await handler(request({ decision: "approve" }), context);

    expect(response.status).toBe(502);
  });
});
