import type { PublicSafeModelInput } from "@/types/public-assistant";
import type { SanitizedAssistantSource } from "./sources";
import { parseSanitizedAssistantSources } from "./sources";

const DISCORD_MENTION_PATTERN = /<(?:@!?|@&|#)\d{17,20}>/g;
const DISCORD_SNOWFLAKE_PATTERN = /(?<!\d)\d{17,20}(?!\d)/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const PROHIBITED_INPUT_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "secret_material", pattern: /\b(?:api[_ -]?key|password|client[_ -]?secret|access[_ -]?token)\s*[:=]\s*\S{8,}/i },
  { code: "secret_material", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i },
  { code: "secret_material", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { code: "secret_material", pattern: /https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\//i },
  {
    code: "private_evidence",
    pattern: /\b(?:raw meeting notes|private evidence|confidential evidence|admin-only evidence|unredacted evidence)\b/i,
  },
];

export type PublicInputRedaction = "discord_identifier" | "email_address";

export type PublicInputPreparation =
  | { ok: true; value: PublicSafeModelInput; redactions: PublicInputRedaction[] }
  | { ok: false; reasons: string[] };

export interface PublicModelSource {
  id: string;
  sourceType: SanitizedAssistantSource["sourceType"];
  title: PublicSafeModelInput;
  canonicalText: PublicSafeModelInput;
  ruleSetId: string;
  releaseId: string;
  sourceVersion: string;
  approvalVersion: string;
  conflictState: SanitizedAssistantSource["conflictState"];
}

export interface PublicModelPayload {
  question: PublicSafeModelInput;
  sources: PublicModelSource[];
}

export type PublicModelProvider<T> = (payload: PublicModelPayload) => Promise<T>;

function preparePublicText(rawInput: string, minimumLength: number): PublicInputPreparation {
  const prohibited = PROHIBITED_INPUT_PATTERNS.filter(({ pattern }) => pattern.test(rawInput)).map(({ code }) => code);
  if (prohibited.length > 0) return { ok: false, reasons: [...new Set(prohibited)] };

  const redactions: PublicInputRedaction[] = [];
  let safe = rawInput;

  const redact = (pattern: RegExp, replacement: string, reason: PublicInputRedaction) => {
    pattern.lastIndex = 0;
    if (pattern.test(safe)) {
      redactions.push(reason);
      pattern.lastIndex = 0;
      safe = safe.replace(pattern, replacement);
    }
  };

  redact(DISCORD_MENTION_PATTERN, "[redacted Discord identifier]", "discord_identifier");
  redact(DISCORD_SNOWFLAKE_PATTERN, "[redacted Discord identifier]", "discord_identifier");
  redact(EMAIL_PATTERN, "[redacted email address]", "email_address");

  safe = safe.trim().replace(/\s{3,}/g, "  ");
  if (safe.length < minimumLength) return { ok: false, reasons: ["insufficient_public_safe_content"] };

  return { ok: true, value: safe as PublicSafeModelInput, redactions: [...new Set(redactions)] };
}

export function preparePublicSafeModelInput(rawInput: string): PublicInputPreparation {
  return preparePublicText(rawInput, 6);
}

export function buildPublicModelPayload(
  question: PublicSafeModelInput,
  sourceInput: unknown,
): PublicModelPayload | null {
  const sources = parseSanitizedAssistantSources(sourceInput);
  if (!sources) return null;

  const publicSources: PublicModelSource[] = [];
  for (const source of sources) {
    if (source.visibility !== "public_sanitized" || source.status !== "published") continue;
    const safeCanonicalText = preparePublicSafeModelInput(source.canonicalText);
    const safeTitle = preparePublicText(source.title, 1);
    if (!safeCanonicalText.ok || !safeTitle.ok) return null;

    publicSources.push({
      id: source.id,
      sourceType: source.sourceType,
      title: safeTitle.value,
      canonicalText: safeCanonicalText.value,
      ruleSetId: source.ruleSetId,
      releaseId: source.releaseId,
      sourceVersion: source.sourceVersion,
      approvalVersion: source.approvalVersion,
      conflictState: source.conflictState,
    });
  }

  if (publicSources.length === 0) return null;

  return {
    question,
    sources: publicSources,
  };
}

export async function routeQuestionToPublicModel<T>(
  rawQuestion: string,
  sourceInput: unknown,
  provider: PublicModelProvider<T>,
): Promise<{ ok: true; value: T; redactions: PublicInputRedaction[] } | { ok: false; reasons: string[] }> {
  const prepared = preparePublicSafeModelInput(rawQuestion);
  if (!prepared.ok) return prepared;

  const payload = buildPublicModelPayload(prepared.value, sourceInput);
  if (!payload) return { ok: false, reasons: ["invalid_public_source_payload"] };

  return { ok: true, value: await provider(payload), redactions: prepared.redactions };
}
