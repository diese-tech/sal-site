import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpenRouterVisionMessage } from "@/lib/openrouter-vision";
import type { Database } from "@/types/database.types";

const roleSchema = z.enum(["solo", "jungle", "mid", "support", "carry"]);
const optionalStatSchema = z.number().int().nonnegative().nullable().optional();

const participantSchema = z.object({
  side: z.enum(["order", "chaos"]),
  rawIgn: z.string().trim().min(1).max(64),
  godName: z.string().trim().min(1).max(100).nullable().optional(),
  role: roleSchema.nullable().optional(),
  playerLevel: z.number().int().min(1).max(20).nullable().optional(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  gpm: optionalStatSchema,
  playerDamage: optionalStatSchema,
  minionDamage: optionalStatSchema,
  jungleDamage: optionalStatSchema,
  structureDamage: optionalStatSchema,
  damageTaken: optionalStatSchema,
  damageMitigated: optionalStatSchema,
  selfHealing: optionalStatSchema,
  allyHealing: optionalStatSchema,
  wardsPlaced: optionalStatSchema,
}).strict();

export const scouterExtractedGameSchema = z.object({
  smiteMatchId: z.string().trim().min(1).max(128).nullable(),
  gameMode: z.string().trim().min(1).max(64).nullable(),
  winningSide: z.enum(["order", "chaos"]),
  matchLengthSeconds: z.number().int().nonnegative().nullable(),
  participants: z.array(participantSchema).length(10),
}).strict().superRefine((game, context) => {
  const orderCount = game.participants.filter((participant) => participant.side === "order").length;
  const chaosCount = game.participants.length - orderCount;
  if (orderCount !== 5 || chaosCount !== 5) {
    context.addIssue({
      code: "custom",
      path: ["participants"],
      message: "Expected five order and five chaos participants.",
    });
  }
});

export type ScouterExtractedGame = z.infer<typeof scouterExtractedGameSchema>;

interface ScouterOcrInput {
  scoreboardImagePath: string;
  detailsImagePath: string;
  expectedSmiteMatchId?: string;
}

interface ScouterOcrDependencies {
  downloadImage: (path: string) => Promise<string>;
  callVision: (messages: OpenRouterVisionMessage[]) => Promise<string>;
}

export class ScouterExtractionError extends Error {
  constructor(message: string, readonly rawResponse: string) {
    super(message);
    this.name = "ScouterExtractionError";
  }
}

const SCOUTER_EXTRACTION_PROMPT = `
You are extracting one SMITE 2 end-of-game record from two screenshots.
The first image is the SCOREBOARD tab. The second image is the DETAILS tab.

Return ONLY valid JSON with this exact shape and all 10 players:
{
  "smiteMatchId": "string or null",
  "gameMode": "string or null",
  "winningSide": "order" | "chaos",
  "matchLengthSeconds": 0,
  "participants": [{
    "side": "order" | "chaos",
    "rawIgn": "string",
    "godName": "string or null",
    "role": "solo" | "jungle" | "mid" | "support" | "carry" | null,
    "playerLevel": 20,
    "kills": 0,
    "deaths": 0,
    "assists": 0,
    "gpm": 0,
    "playerDamage": 0,
    "minionDamage": 0,
    "jungleDamage": 0,
    "structureDamage": 0,
    "damageTaken": 0,
    "damageMitigated": 0,
    "selfHealing": 0,
    "allyHealing": 0,
    "wardsPlaced": 0
  }]
}

Use null only when an optional value is genuinely unreadable. Kills, deaths,
assists, side, rawIgn, and winningSide are required. Remove commas from numeric
values. Copy the SMITE match ID exactly from the top-right identifier.
`.trim();

function stripCodeFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function downloadScouterImage(
  client: SupabaseClient<Database>,
  path: string,
): Promise<string> {
  const { data, error } = await client.storage.from("match-screenshots").download(path);
  if (error || !data) {
    throw new Error(`Unable to read scouter image ${path}: ${error?.message ?? "not found"}`);
  }

  const extension = path.split(".").at(-1)?.toLowerCase();
  const fallbackMime = extension === "png"
    ? "image/png"
    : extension === "webp"
      ? "image/webp"
      : "image/jpeg";
  const mimeType = data.type.startsWith("image/") ? data.type : fallbackMime;
  const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export async function extractScouterGameFromStorage(
  input: ScouterOcrInput,
  dependencies: ScouterOcrDependencies,
): Promise<ScouterExtractedGame> {
  const [scoreboardDataUrl, detailsDataUrl] = await Promise.all([
    dependencies.downloadImage(input.scoreboardImagePath),
    dependencies.downloadImage(input.detailsImagePath),
  ]);

  const rawResponse = await dependencies.callVision([
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: scoreboardDataUrl } },
        { type: "image_url", image_url: { url: detailsDataUrl } },
        { type: "text", text: SCOUTER_EXTRACTION_PROMPT },
      ],
    },
  ]);

  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(rawResponse));
  } catch {
    throw new ScouterExtractionError("OCR response was not valid JSON.", rawResponse);
  }

  const parsed = scouterExtractedGameSchema.safeParse(json);
  if (!parsed.success) {
    throw new ScouterExtractionError("OCR response was not valid scouter data.", rawResponse);
  }

  if (
    input.expectedSmiteMatchId
    && parsed.data.smiteMatchId
    && parsed.data.smiteMatchId !== input.expectedSmiteMatchId
  ) {
    throw new ScouterExtractionError("OCR match ID did not match the expected SMITE match ID.", rawResponse);
  }

  return {
    ...parsed.data,
    smiteMatchId: parsed.data.smiteMatchId ?? input.expectedSmiteMatchId ?? null,
  };
}
