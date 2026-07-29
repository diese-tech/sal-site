const DEFAULT_VISION_MODEL = "google/gemini-2.0-flash-001";

export interface OpenRouterVisionMessage {
  role: "user" | "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
}

interface OpenRouterVisionOptions {
  maxTokens?: number;
  title?: string;
}

export async function callOpenRouterVision(
  messages: OpenRouterVisionMessage[],
  options: OpenRouterVisionOptions = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://sal.gg",
      "X-Title": options.title ?? "SAL Vision Extraction",
    },
    body: JSON.stringify({
      model:
        process.env.OPENROUTER_MODEL_VISION
        ?? process.env.OPENROUTER_MODEL
        ?? DEFAULT_VISION_MODEL,
      max_tokens: options.maxTokens ?? 4096,
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`OpenRouter error ${response.status}: ${detail}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data.error) throw new Error(data.error.message ?? "OpenRouter API error");
  return data.choices?.[0]?.message?.content ?? "";
}
