import { describe, expect, it, vi } from "vitest";
import {
  correctScouterGame,
  getScouterGameCorrectionSnapshot,
  parseScouterGameCorrectionSnapshot,
  scouterCorrectionRequestSchema,
  type ScouterCorrectionGame,
} from "./scouter-corrections";

const participants: ScouterCorrectionGame["participants"] = Array.from(
  { length: 10 },
  (_, index) => ({
  id: `participant-${index + 1}`,
  side: index < 5 ? "order" : "chaos",
  rawIgn: `Player ${index + 1}`,
  playerId: index === 0 ? "player-1" : null,
  godId: index === 0 ? "god-1" : null,
  role: index % 5 === 0 ? "solo" : null,
  playerLevel: 20,
  kills: index,
  deaths: 1,
  assists: 10 - index,
  gpm: 500,
  playerDamage: 10_000,
  minionDamage: 20_000,
  jungleDamage: 3_000,
  structureDamage: 4_000,
  damageTaken: 15_000,
  damageMitigated: 16_000,
  selfHealing: 1_000,
  allyHealing: 0,
  wardsPlaced: 8,
  }),
);

const game = {
  smiteMatchId: "smite-match-1",
  gameMode: "Conquest",
  winningSide: "order" as const,
  matchLengthSeconds: 1_800,
  participants,
};

describe("scouter correction contract", () => {
  it("requires a complete five-versus-five replacement and an audit reason", () => {
    const valid = scouterCorrectionRequestSchema.safeParse({
      expectedRevision: 1,
      correctionKey: "correction-1",
      reason: "OCR misread two player names.",
      game,
    });
    const incomplete = scouterCorrectionRequestSchema.safeParse({
      expectedRevision: 1,
      correctionKey: "correction-1",
      reason: "OCR misread two player names.",
      game: { ...game, participants: participants.slice(0, 9) },
    });

    expect(valid.success).toBe(true);
    expect(incomplete.success).toBe(false);
  });

  it("rejects duplicate participant ids and duplicate IGNs", () => {
    const duplicate = participants.map((participant) => ({ ...participant }));
    duplicate[1].id = duplicate[0].id;
    duplicate[2].rawIgn = duplicate[0].rawIgn.toUpperCase();

    const result = scouterCorrectionRequestSchema.safeParse({
      expectedRevision: 1,
      correctionKey: "correction-1",
      reason: "OCR correction",
      game: { ...game, participants: duplicate },
    });

    expect(result.success).toBe(false);
  });

  it("maps the complete persisted game and identity catalogs", () => {
    const snapshot = parseScouterGameCorrectionSnapshot(
      {
        id: "game-1",
        scouter_match_id: "match-1",
        game_ordinal: 2,
        revision: 3,
        smite_match_id: game.smiteMatchId,
        game_mode: game.gameMode,
        winning_side: game.winningSide,
        match_length_seconds: game.matchLengthSeconds,
        scoreboard_image_path: "scouters/match-1/scoreboard.png",
        details_image_path: "scouters/match-1/details.png",
        participants: participants.map((participant) => ({
          id: participant.id,
          side: participant.side,
          raw_ign: participant.rawIgn,
          player_id: participant.playerId,
          god_id: participant.godId,
          role: participant.role,
          player_level: participant.playerLevel,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          gpm: participant.gpm,
          player_damage: participant.playerDamage,
          minion_damage: participant.minionDamage,
          jungle_damage: participant.jungleDamage,
          structure_damage: participant.structureDamage,
          damage_taken: participant.damageTaken,
          damage_mitigated: participant.damageMitigated,
          self_healing: participant.selfHealing,
          ally_healing: participant.allyHealing,
          wards_placed: participant.wardsPlaced,
        })),
      },
      [{ id: "player-1", ign: "Player 1", discord_username: "player-one", status: "active" }],
      [{ id: "god-1", name: "Achilles" }],
      {
        scoreboard: "https://signed.example/scoreboard.png",
        details: "https://signed.example/details.png",
      },
    );

    expect(snapshot).toMatchObject({
      id: "game-1",
      matchId: "match-1",
      revision: 3,
      scoreboardImageUrl: "https://signed.example/scoreboard.png",
      players: [{ id: "player-1", ign: "Player 1" }],
      gods: [{ id: "god-1", name: "Achilles" }],
    });
    expect(snapshot.game.participants).toHaveLength(10);
    expect(snapshot.game.participants[0]).toMatchObject({
      rawIgn: "Player 1",
      playerDamage: 10_000,
    });
  });

  it("calls the audited idempotent full-game RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        code: "corrected",
        applied: true,
        correctionId: "receipt-1",
        scouterGameId: "game-1",
        revision: 2,
      },
      error: null,
    });

    await expect(
      correctScouterGame(
        { rpc } as never,
        "game-1",
        "admin-discord-1",
        {
          expectedRevision: 1,
          correctionKey: "correction-1",
          reason: "OCR misread two player names.",
          game,
        },
      ),
    ).resolves.toMatchObject({ code: "corrected", revision: 2 });
    expect(rpc).toHaveBeenCalledWith("correct_scouter_game", {
      p_scouter_game_id: "game-1",
      p_actor_discord_id: "admin-discord-1",
      p_expected_revision: 1,
      p_correction_key: "correction-1",
      p_reason: "OCR misread two player names.",
      p_game: game,
    });
  });

  it("loads stored evidence through short-lived signed URLs", async () => {
    const rawGame = {
      id: "game-1",
      scouter_match_id: "match-1",
      game_ordinal: 1,
      revision: 1,
      smite_match_id: game.smiteMatchId,
      game_mode: game.gameMode,
      winning_side: game.winningSide,
      match_length_seconds: game.matchLengthSeconds,
      scoreboard_image_path: "scouters/match-1/scoreboard.png",
      details_image_path: "scouters/match-1/details.png",
      participants: participants.map((participant) => ({
        id: participant.id,
        side: participant.side,
        raw_ign: participant.rawIgn,
        player_id: participant.playerId,
        god_id: participant.godId,
        role: participant.role,
        player_level: participant.playerLevel,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        gpm: participant.gpm,
        player_damage: participant.playerDamage,
        minion_damage: participant.minionDamage,
        jungle_damage: participant.jungleDamage,
        structure_damage: participant.structureDamage,
        damage_taken: participant.damageTaken,
        damage_mitigated: participant.damageMitigated,
        self_healing: participant.selfHealing,
        ally_healing: participant.allyHealing,
        wards_placed: participant.wardsPlaced,
      })),
    };
    const gameQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: rawGame, error: null }),
    };
    const signedUrl = vi
      .fn()
      .mockResolvedValueOnce({ data: { signedUrl: "https://signed/scoreboard" }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: "https://signed/details" }, error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "scouter_games") return gameQuery;
        if (table === "players") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: "player-1", ign: "Player 1", discord_username: "p1", status: "active" }],
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: "god-1", name: "Achilles" }],
            error: null,
          }),
        };
      }),
      storage: { from: vi.fn(() => ({ createSignedUrl: signedUrl })) },
    };

    const snapshot = await getScouterGameCorrectionSnapshot("game-1", client as never);

    expect(gameQuery.eq).toHaveBeenCalledWith("id", "game-1");
    expect(signedUrl).toHaveBeenNthCalledWith(1, rawGame.scoreboard_image_path, 3600);
    expect(signedUrl).toHaveBeenNthCalledWith(2, rawGame.details_image_path, 3600);
    expect(snapshot).toMatchObject({
      scoreboardImageUrl: "https://signed/scoreboard",
      detailsImageUrl: "https://signed/details",
    });
  });
});
