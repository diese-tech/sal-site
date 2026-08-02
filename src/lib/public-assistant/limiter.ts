import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { checkRateLimit, getRateLimitIdentifier } from "@/lib/rate-limit";

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

export function getDurableRequestLimiter(): DurableRequestLimiter | null {
  // Launch protection uses the site's existing in-memory limiter. This is
  // best-effort on serverless instances; sal-database should eventually own a
  // shared limiter alongside versioned rulebook ingestion.
  return {
    async consume({ route, request, actorKey }) {
      const identifier = actorKey ?? getRateLimitIdentifier(request);
      const key = `${route}:${identifier}`;
      const decision = checkRateLimit(key);
      const decisionId = createHash("sha256")
        .update(`${key}:${decision.resetAt}`)
        .digest("hex")
        .slice(0, 32);

      return {
        allowed: decision.allowed,
        retryAfterSeconds: decision.allowed
          ? null
          : Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1_000)),
        decisionId,
      };
    },
  };
}
