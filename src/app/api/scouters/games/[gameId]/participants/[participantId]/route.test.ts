import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createDeprecatedParticipantPatchHandler } from "./route";

const context = {
  params: Promise.resolve({ gameId: "game-1", participantId: "participant-1" }),
};

describe("deprecated participant-only scouter correction", () => {
  it("rejects unauthenticated callers", async () => {
    const handler = createDeprecatedParticipantPatchHandler({ isAuthorized: () => false });
    const response = await handler(
      new NextRequest("https://sal.example/api/scouters/games/game-1/participants/participant-1", {
        method: "PATCH",
      }),
      context,
    );

    expect(response.status).toBe(401);
  });

  it("fails closed and points authenticated callers to full-game correction", async () => {
    const handler = createDeprecatedParticipantPatchHandler({ isAuthorized: () => true });
    const response = await handler(
      new NextRequest("https://sal.example/api/scouters/games/game-1/participants/participant-1", {
        method: "PATCH",
      }),
      context,
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      adminPath: "/admin/scouters/game-1",
    });
  });
});
