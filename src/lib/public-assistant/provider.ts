import { z } from "zod";
import { PUBLIC_ASSISTANT_MODEL } from "@/types/public-assistant";
import type { PublicModelPayload } from "./privacy";

const providerAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(12_000),
  citedSourceIds: z.array(z.string().min(1)).min(1).max(8),
}).strict();

export type PublicAssistantProviderAnswer = z.infer<typeof providerAnswerSchema>;

function parseProviderJson(raw: string): PublicAssistantProviderAnswer | null {
  const trimmed = raw.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace
    ? unfenced.slice(firstBrace, lastBrace + 1)
    : unfenced;
  try {
    const parsed = providerAnswerSchema.safeParse(JSON.parse(jsonText));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function askOpenRouterPublicAssistant(
  payload: PublicModelPayload,
): Promise<PublicAssistantProviderAnswer> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");

  const sources = payload.sources.map((source) => ({
    id: source.id,
    type: source.sourceType,
    title: source.title,
    text: source.canonicalText,
  }));
  const allowedIds = new Set(sources.map(({ id }) => id));
  const requestBody = JSON.stringify({
    model: PUBLIC_ASSISTANT_MODEL,
    temperature: 0,
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content:
          "You are the public Serpent Ascension League rules assistant. Answer only from the supplied published rulebook and approved precedent scenarios. Never use outside knowledge, invent a rule, or treat an FAQ as authority. Your answer is advisory, not a binding ruling. If the sources conflict, are unclear, or do not answer the question, say so plainly and recommend SAL admin or council review. Return only JSON with exactly two keys: answer (string) and citedSourceIds (array of supplied source IDs). Cite every source you rely on.",
      },
      {
        role: "user",
        content: JSON.stringify({ question: payload.question, sources }),
      },
    ],
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://sal.gg",
          "X-Title": "SAL Public Rules Assistant",
        },
        body: requestBody,
        signal: AbortSignal.timeout(18_000),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`OpenRouter error ${response.status}: ${detail.slice(0, 500)}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (data.error) throw new Error(data.error.message ?? "OpenRouter API error");

      const parsed = parseProviderJson(data.choices?.[0]?.message?.content ?? "");
      if (!parsed) throw new Error("OpenRouter returned an invalid assistant response.");

      const citedSourceIds = [...new Set(parsed.citedSourceIds)].filter((id) => allowedIds.has(id));
      if (citedSourceIds.length === 0) throw new Error("OpenRouter response did not cite an approved source.");
      return { answer: parsed.answer, citedSourceIds };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenRouter provider failed.");
}
