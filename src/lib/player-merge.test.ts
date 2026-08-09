import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({ rpc }),
}));

import {
  applyPlayerMerge,
  PlayerMergeContractError,
  previewPlayerMerge,
} from "@/lib/player-merge";

const identity = {
  id: "player-source",
  ign: "Pringle Imperialist",
  discordUsername: "pringleimperialist",
  orgId: null,
  divisionId: null,
  status: "free-agent",
  isCaptain: false,
  isStarter: false,
  profileClaimed: true,
  hasDiscordId: true,
  archivedAt: null,
};

describe("player merge database contract", () => {
  beforeEach(() => rpc.mockReset());

  it("calls the preview RPC with the pinned arguments and validates its JSON", async () => {
    const preview = {
      source: identity,
      target: { ...identity, id: "player-target" },
      counts: { seasonRosters: 1 },
      blockers: [],
      blockerCodes: [],
      canMerge: true,
    };
    rpc.mockResolvedValue({ data: preview, error: null });

    await expect(previewPlayerMerge("player-source", "player-target")).resolves.toEqual(preview);
    expect(rpc).toHaveBeenCalledWith("preview_player_merge", {
      p_source_player_id: "player-source",
      p_target_player_id: "player-target",
    });
  });

  it("fails closed when a preview violates the pinned JSON contract", async () => {
    rpc.mockResolvedValue({
      data: { source: identity, target: null, counts: { seasonRosters: -1 }, blockers: [], canMerge: true },
      error: null,
    });

    await expect(previewPlayerMerge("player-source", "player-target")).rejects.toBeInstanceOf(
      PlayerMergeContractError,
    );
  });

  it.each([
    ["different-source", "player-target"],
    ["player-source", "different-target"],
  ])("fails closed when a shape-valid preview identifies different players", async (sourceId, targetId) => {
    rpc.mockResolvedValue({
      data: {
        source: { ...identity, id: sourceId },
        target: { ...identity, id: targetId },
        counts: {},
        blockers: [],
        blockerCodes: [],
        canMerge: true,
      },
      error: null,
    });

    await expect(previewPlayerMerge("player-source", "player-target")).rejects.toBeInstanceOf(
      PlayerMergeContractError,
    );
  });

  it("passes the acting Discord ID to the transactional apply RPC", async () => {
    const result = {
      code: "already_merged",
      applied: false,
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
    };
    rpc.mockResolvedValue({ data: result, error: null });

    await expect(applyPlayerMerge({
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      actorDiscordId: "super-1",
    })).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith("merge_player", {
      p_source_player_id: "player-source",
      p_target_player_id: "player-target",
      p_actor_discord_id: "super-1",
    });
  });

  it("fails closed when a shape-valid apply result identifies a different target", async () => {
    rpc.mockResolvedValue({
      data: {
        code: "already_merged",
        applied: false,
        sourcePlayerId: "player-source",
        targetPlayerId: "different-target",
      },
      error: null,
    });

    await expect(applyPlayerMerge({
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      actorDiscordId: "super-1",
    })).rejects.toBeInstanceOf(PlayerMergeContractError);
  });

  it("fails closed when merged identity evidence does not match the requested pair", async () => {
    rpc.mockResolvedValue({
      data: {
        code: "merged",
        applied: true,
        sourcePlayerId: "player-source",
        targetPlayerId: "player-target",
        source: { ...identity, id: "player-source" },
        target: { ...identity, id: "different-target" },
        counts: {},
      },
      error: null,
    });

    await expect(applyPlayerMerge({
      sourcePlayerId: "player-source",
      targetPlayerId: "player-target",
      actorDiscordId: "super-1",
    })).rejects.toBeInstanceOf(PlayerMergeContractError);
  });
});
