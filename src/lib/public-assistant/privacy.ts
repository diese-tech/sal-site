import { createHash } from "node:crypto";
import { z } from "zod";
import type { PublicSafeModelInput } from "@/types/public-assistant";
import type { SanitizedAssistantSource } from "./sources";

const UNTRUSTED_RISK_PATTERNS: Array<{ code: string; pattern: RegExp; replacement?: string }> = [
  { code: "discord_identifier", pattern: /<(?:@!?|@&|#)\d{17,20}>|(?<!\d)\d{17,20}(?!\d)/g, replacement: "[possible Discord identifier]" },
  { code: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[possible email]" },
  { code: "username", pattern: /(?:\B@[A-Za-z0-9_.-]{2,32}\b|\b(?:user(?:name)?|IGN)\s*(?:is|[:=])\s*\S+)/gi },
  { code: "self_identification", pattern: /\b(?:my name is|I am|I'm)\s+[A-Z][A-Za-z'-]{1,40}\b/g },
  { code: "phone", pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g },
  { code: "street_address", pattern: /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Ct)\b/gi },
  { code: "admin_vote", pattern: /\b(?:admin|moderator)\s+\S+\s+voted\s+(?:yes|no|for|against)\b/gi },
  { code: "private_prose", pattern: /\b(?:private admin chat|raw meeting notes|private evidence|confidential evidence|admin-only evidence|unredacted evidence)\b/gi },
  { code: "secret", pattern: /\b(?:api[_ -]?key|password|client[_ -]?secret|access[_ -]?token)\s*[:=]\s*\S{8,}/gi },
  { code: "secret", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/g },
  { code: "secret", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { code: "secret", pattern: /https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\//gi },
];

const privacyGuardDecisionSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("verified_public_safe"),
      decisionId: z.string().min(8).max(160),
      policyVersion: z.string().min(1).max(80),
      auditedAt: z.iso.datetime({ offset: true }),
      inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
      sanitizedText: z.string().min(1).max(50_000),
      findings: z.array(z.string().min(1).max(80)).max(100),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("rejected"),
      decisionId: z.string().min(8).max(160),
      policyVersion: z.string().min(1).max(80),
      auditedAt: z.iso.datetime({ offset: true }),
      inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
      findings: z.array(z.string().min(1).max(80)).min(1).max(100),
    })
    .strict(),
]);

export interface UntrustedPrivacyPrefilter {
  candidate: string;
  riskHints: string[];
}

export interface PrivacyGuardInput {
  rawText: string;
  untrustedCandidate: string;
  riskHints: string[];
  context: "question" | "source_title" | "source_text";
  inputDigest: string;
}

export interface AssistantPrivacyGuard {
  inspect(input: PrivacyGuardInput): Promise<unknown>;
}

export interface GuardVerifiedSource {
  id: string;
  sourceType: SanitizedAssistantSource["sourceType"];
  title: PublicSafeModelInput;
  canonicalText: PublicSafeModelInput;
  ruleSetId: string;
  releaseId: string;
  sourceVersion: string;
  approvalVersion: string;
  conflictState: SanitizedAssistantSource["conflictState"];
  privacyDecisionIds: [string, string];
}

export interface PublicModelPayload {
  question: PublicSafeModelInput;
  questionPrivacyDecisionId: string;
  sources: GuardVerifiedSource[];
}

export type PublicModelProvider<T> = (payload: PublicModelPayload) => Promise<T>;

export function untrustedPrivacyPrefilter(rawInput: string): UntrustedPrivacyPrefilter {
  const riskHints: string[] = [];
  let candidate = rawInput;

  for (const risk of UNTRUSTED_RISK_PATTERNS) {
    risk.pattern.lastIndex = 0;
    if (!risk.pattern.test(rawInput)) continue;
    riskHints.push(risk.code);
    if (risk.replacement) {
      risk.pattern.lastIndex = 0;
      candidate = candidate.replace(risk.pattern, risk.replacement);
    }
  }

  return { candidate: candidate.trim(), riskHints: [...new Set(riskHints)] };
}

export function getAssistantPrivacyGuard(): AssistantPrivacyGuard | null {
  return null;
}

async function verifyTextWithGuard(
  rawText: string,
  context: PrivacyGuardInput["context"],
  guard: AssistantPrivacyGuard,
): Promise<{ text: PublicSafeModelInput; decisionId: string } | null> {
  const prefilter = untrustedPrivacyPrefilter(rawText);
  const inputDigest = createHash("sha256").update(rawText, "utf8").digest("hex");
  const decision = privacyGuardDecisionSchema.safeParse(
    await guard.inspect({
      rawText,
      untrustedCandidate: prefilter.candidate,
      riskHints: prefilter.riskHints,
      context,
      inputDigest,
    }),
  );

  if (!decision.success || decision.data.outcome !== "verified_public_safe") return null;
  if (decision.data.inputDigest !== inputDigest) return null;

  return {
    text: decision.data.sanitizedText as PublicSafeModelInput,
    decisionId: decision.data.decisionId,
  };
}

export function verifyQuestionWithPrivacyGuard(
  rawQuestion: string,
  guard: AssistantPrivacyGuard,
): Promise<{ text: PublicSafeModelInput; decisionId: string } | null> {
  return verifyTextWithGuard(rawQuestion, "question", guard);
}

export async function verifySourcesWithPrivacyGuard(
  sources: SanitizedAssistantSource[],
  guard: AssistantPrivacyGuard,
): Promise<GuardVerifiedSource[] | null> {
  const verified: GuardVerifiedSource[] = [];
  for (const source of sources) {
    const [title, text] = await Promise.all([
      verifyTextWithGuard(source.title, "source_title", guard),
      verifyTextWithGuard(source.canonicalText, "source_text", guard),
    ]);
    if (!title || !text) return null;

    verified.push({
      id: source.id,
      sourceType: source.sourceType,
      title: title.text,
      canonicalText: text.text,
      ruleSetId: source.ruleSetId,
      releaseId: source.releaseId,
      sourceVersion: source.sourceVersion,
      approvalVersion: source.approvalVersion,
      conflictState: source.conflictState,
      privacyDecisionIds: [title.decisionId, text.decisionId],
    });
  }
  return verified;
}

export function buildPublicModelPayload(
  question: { text: PublicSafeModelInput; decisionId: string },
  sources: GuardVerifiedSource[],
): PublicModelPayload | null {
  if (sources.length === 0) return null;
  return { question: question.text, questionPrivacyDecisionId: question.decisionId, sources };
}

export async function buildGuardVerifiedPublicModelPayload(
  rawQuestion: string,
  sources: SanitizedAssistantSource[],
  guard: AssistantPrivacyGuard,
): Promise<PublicModelPayload | null> {
  const [question, verifiedSources] = await Promise.all([
    verifyQuestionWithPrivacyGuard(rawQuestion, guard),
    verifySourcesWithPrivacyGuard(sources, guard),
  ]);
  if (!question || !verifiedSources) return null;
  return buildPublicModelPayload(question, verifiedSources);
}

export async function routeQuestionToPublicModel<T>(
  rawQuestion: string,
  sources: SanitizedAssistantSource[],
  guard: AssistantPrivacyGuard | null,
  provider: PublicModelProvider<T>,
): Promise<{ ok: true; value: T } | { ok: false; reasons: string[] }> {
  if (!guard) return { ok: false, reasons: ["privacy_guard_missing"] };
  if (sources.length === 0) return { ok: false, reasons: ["no_eligible_public_sources"] };

  const payload = await buildGuardVerifiedPublicModelPayload(rawQuestion, sources, guard);
  if (!payload) return { ok: false, reasons: ["privacy_guard_rejected"] };
  return { ok: true, value: await provider(payload) };
}
