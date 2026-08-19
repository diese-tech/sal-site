import { z } from "zod";

const playerIdSchema = z.string().min(1).max(200);

export const issuedTokenResultSchema = z.object({
  matchReportId: z.string().uuid(),
  hostDiscordId: z.string().min(1),
  expiresAt: z.string().datetime(),
}).strict();

export const consumedTokenResultSchema = z.object({
  matchReportId: z.string().uuid(),
  hostDiscordId: z.string().min(1),
}).strict().nullable();

export const extractedPlayerSchema = z.object({
  ign: z.string().trim().min(1).max(100),
  side: z.enum(["home", "away"]),
  god: z.string().trim().min(1).max(100).optional(),
  role: z.string().trim().min(1).max(100).optional(),
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
  damageDealt: z.number().int().min(0).optional(),
  damageMitigated: z.number().int().min(0).optional(),
  forfeit: z.boolean().optional(),
  playerId: playerIdSchema.optional(),
}).strict();

export const extractedGameSchema = z.object({
  gameNumber: z.number().int().min(1).max(5),
  winningSide: z.enum(["home", "away", "unknown"]),
  players: z.array(extractedPlayerSchema).max(10),
}).strict();

export const extractedGamesSchema = z.array(extractedGameSchema).max(5);

export const reviewedGameSchema = z.object({
  gameNumber: z.number().int().min(1).max(5),
  winningSide: z.enum(["home", "away"]),
  players: z.array(extractedPlayerSchema).length(10),
}).strict().superRefine((game, context) => {
  for (const side of ["home", "away"] as const) {
    if (game.players.filter((player) => player.side === side).length !== 5) {
      context.addIssue({
        code: "custom",
        message: `Game ${game.gameNumber} must contain exactly five ${side} players.`,
        path: ["players"],
      });
    }
  }
});

export const reviewedGamesSchema = z.array(reviewedGameSchema).min(1).max(5);

export const diagnosticsSchema = z.object({
  gameCount: z.number().int().min(0).max(5),
  duplicateIgns: z.array(z.string()),
  unlinkedIgns: z.array(z.string()),
  ambiguousIgns: z.array(z.string()),
  games: z.array(z.object({
    gameNumber: z.number().int().min(1).max(5),
    players: z.array(z.object({
      index: z.number().int().min(0).max(9),
      side: z.enum(["home", "away"]),
      rawIgn: z.string(),
      playerId: playerIdSchema.nullable(),
      identityStatus: z.enum(["linked", "duplicate", "unlinked", "ambiguous"]),
    }).strict()).max(10),
  }).strict()).max(5),
}).strict();

export const reviseResultSchema = z.object({
  code: z.literal("revised"),
  applied: z.boolean(),
  reportId: z.string().uuid(),
  revision: z.number().int().min(1),
  status: z.literal("review"),
  games: reviewedGamesSchema,
  diagnostics: diagnosticsSchema,
}).strict();

export const submitResultSchema = z.object({
  code: z.enum(["submitted", "already_submitted"]),
  applied: z.boolean(),
  reportId: z.string().uuid(),
  pendingActionId: z.string(),
  matchId: z.string(),
  revision: z.number().int().min(1),
  status: z.literal("host_review"),
  hostSubmittedAt: z.string().datetime(),
  outboxIds: z.array(z.string()),
}).strict();
