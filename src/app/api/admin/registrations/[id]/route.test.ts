import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createRegistrationReviewHandler } from "./route";

const routeContext = { params: Promise.resolve({ id: "registration-1" }) };

function request(body: unknown) {
  return new NextRequest("https://sal.example/api/admin/registrations/registration-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/registrations/[id]", () => {
  it("rejects callers without an admin session before invoking the database", async () => {
    const resolveRegistration = vi.fn();
    const handler = createRegistrationReviewHandler({
      getSession: () => null,
      resolveRegistration,
    });

    const response = await handler(request({ status: "approved" }), routeContext);

    expect(response.status).toBe(401);
    expect(resolveRegistration).not.toHaveBeenCalled();
  });

  it("maps approval to the atomic registration RPC and preserves the response shape", async () => {
    const resolveRegistration = vi.fn().mockResolvedValue({
      code: "applied",
      registrationId: "registration-1",
      finalStatus: "approved",
      applied: true,
      playerId: "player-1",
    });
    const handler = createRegistrationReviewHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveRegistration,
    });

    const response = await handler(
      request({ status: "approved", reviewerNote: "Verified" }),
      routeContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, playerId: "player-1" });
    expect(resolveRegistration).toHaveBeenCalledTimes(1);
    expect(resolveRegistration).toHaveBeenCalledWith({
      registrationId: "registration-1",
      actorDiscordId: "admin-1",
      decision: "approve",
      reviewerNote: "Verified",
    });
  });

  it("requires a reason when rejecting a registration", async () => {
    const resolveRegistration = vi.fn();
    const handler = createRegistrationReviewHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveRegistration,
    });

    const response = await handler(request({ status: "rejected", reviewerNote: "  " }), routeContext);

    expect(response.status).toBe(400);
    expect(resolveRegistration).not.toHaveBeenCalled();
  });

  it("rejects the legacy pending transition instead of bypassing the atomic resolver", async () => {
    const resolveRegistration = vi.fn();
    const handler = createRegistrationReviewHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveRegistration,
    });

    const response = await handler(request({ status: "pending" }), routeContext);

    expect(response.status).toBe(400);
    expect(resolveRegistration).not.toHaveBeenCalled();
  });

  it("fails closed when the RPC returns an unexpected contract", async () => {
    const handler = createRegistrationReviewHandler({
      getSession: () => ({ discordId: "admin-1" }),
      resolveRegistration: vi.fn().mockResolvedValue({ playerId: "player-1" }),
    });

    const response = await handler(request({ status: "approved" }), routeContext);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Registration review returned an invalid database response.",
    });
  });
});
