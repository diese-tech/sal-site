import type { NextRequest } from "next/server";
import { z } from "zod";

const durableLimiterDecisionSchema = z
  .object({
    allowed: z.boolean(),
    retryAfterSeconds: z.number().int().nonnegative().nullable(),
    decisionId: z.string().min(8).max(160),
  })
  .strict();

export interface DurableLimiterInput {
  route: "public_assistant" | "official_ruling_request";
  request: NextRequest;
  actorKey?: string;
}

export interface DurableLimiterDecision {
  allowed: boolean;
  retryAfterSeconds: number | null;
  decisionId: string;
}

export interface DurableRequestLimiter {
  consume(input: DurableLimiterInput): Promise<unknown>;
}

export function parseDurableLimiterDecision(input: unknown): DurableLimiterDecision | null {
  const parsed = durableLimiterDecisionSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Release B must supply a shared database-backed limiter for site and bot traffic. */
export function getDurableRequestLimiter(): DurableRequestLimiter | null {
  return null;
}
