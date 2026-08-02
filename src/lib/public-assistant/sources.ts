import { createHash } from "node:crypto";
import { z } from "zod";
import type { AssistantQuestionScope, AssistantSourceType, PublicSafeModelInput } from "@/types/public-assistant";
import { isSafePublicUrl } from "./safe-url";
import {
  PUBLIC_ASSISTANT_SOURCE_CONTRACT,
  RULEBOOK_PUBLIC_URL,
  RULEBOOK_TEXT_EXPORT_URL,
} from "./config";

export const PUBLIC_SOURCE_PRECEDENCE: Record<AssistantSourceType, number> = {
  published_rule: 1,
  sanitized_precedent: 2,
  public_faq: 3,
};

const publicIdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => !/^\d{17,20}$/.test(value), "Public source identifiers cannot be Discord snowflakes.");

const publicScopeSchema = z
  .object({
    global: z.boolean(),
    seasonIds: z.array(z.string().min(1).max(160)).max(100),
    divisionScopes: z.array(z.object({
      seasonId: z.string().min(1).max(160),
      divisionId: z.string().min(1).max(160),
    }).strict()).max(100),
  })
  .strict()
  .superRefine((scope, context) => {
    if (scope.global && (scope.seasonIds.length > 0 || scope.divisionScopes.length > 0)) {
      context.addIssue({ code: "custom", message: "Global sources cannot also declare season or division scope." });
    }
    if (!scope.global && scope.seasonIds.length === 0 && scope.divisionScopes.length === 0) {
      context.addIssue({ code: "custom", message: "A non-global source must declare season or division scope." });
    }
    if (new Set(scope.seasonIds).size !== scope.seasonIds.length) {
      context.addIssue({ code: "custom", message: "Season scopes must be unique." });
    }
    const divisionPairs = scope.divisionScopes.map(
      ({ seasonId, divisionId }) => `${seasonId}\u0000${divisionId}`,
    );
    if (new Set(divisionPairs).size !== divisionPairs.length) {
      context.addIssue({ code: "custom", message: "Season and division scope pairs must be unique." });
    }
  });

export const sanitizedAssistantSourceSchema = z
  .object({
    id: publicIdentifierSchema,
    sourceType: z.enum(["published_rule", "sanitized_precedent", "public_faq"]),
    title: z.string().min(1).max(240),
    canonicalText: z.string().min(1).max(50_000),
    ruleSetId: publicIdentifierSchema,
    releaseId: publicIdentifierSchema,
    sourceVersion: z.string().min(1).max(80),
    approvalVersion: z.string().min(1).max(80),
    scope: publicScopeSchema,
    effectiveAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    status: z.enum(["published", "superseded"]),
    supersededBy: publicIdentifierSchema.nullable(),
    conflictState: z.enum(["none", "detected", "under_review", "resolved"]),
    visibility: z.literal("public_sanitized"),
    publicUrl: z.string().min(1).refine(isSafePublicUrl, "Source URL must be relative or HTTPS without credentials."),
  })
  .strict()
  .superRefine((source, context) => {
    if (source.expiresAt && Date.parse(source.expiresAt) <= Date.parse(source.effectiveAt)) {
      context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after the effective time." });
    }
    if (source.status === "superseded" && !source.supersededBy) {
      context.addIssue({ code: "custom", path: ["supersededBy"], message: "Superseded sources require a successor." });
    }
    if (source.status === "published" && source.supersededBy) {
      context.addIssue({ code: "custom", path: ["supersededBy"], message: "Current sources cannot name a successor." });
    }
  });

export type SanitizedAssistantSource = z.infer<typeof sanitizedAssistantSourceSchema>;

export const sanitizedSourceReadinessSchema = z
  .object({
    ready: z.boolean(),
    ruleSetId: z.string().min(1).max(160).nullable(),
    releaseId: z.string().min(1).max(160).nullable(),
    approvalVersion: z.string().min(1).max(80).nullable(),
    sourceCount: z.number().int().nonnegative(),
    verifiedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export type SanitizedSourceReadiness = z.infer<typeof sanitizedSourceReadinessSchema>;

export interface ExpectedSourceContract {
  ruleSetId: string;
  releaseId: string;
  approvalVersion: string;
}

export interface SourceReadinessVerification {
  verified: boolean;
  reasons: string[];
}

export interface SanitizedSourceSearch {
  question: PublicSafeModelInput;
  scope: AssistantQuestionScope;
  limit: number;
  sourceTypes: AssistantSourceType[];
}

export interface SanitizedSourceRetriever {
  readiness(): Promise<SanitizedSourceReadiness>;
  search(input: SanitizedSourceSearch): Promise<SanitizedAssistantSource[]>;
}

export function verifySanitizedSourceReadiness(
  input: unknown,
  expected: ExpectedSourceContract,
): SourceReadinessVerification {
  const parsed = sanitizedSourceReadinessSchema.safeParse(input);
  if (!parsed.success) return { verified: false, reasons: ["invalid_readiness_payload"] };

  const readiness = parsed.data;
  const reasons: string[] = [];
  if (!readiness.ready) reasons.push("repository_not_ready");
  if (readiness.sourceCount < 1) reasons.push("no_public_sources");
  if (!readiness.verifiedAt) reasons.push("verification_missing");
  if (readiness.ruleSetId !== expected.ruleSetId) reasons.push("rule_set_mismatch");
  if (readiness.releaseId !== expected.releaseId) reasons.push("release_mismatch");
  if (readiness.approvalVersion !== expected.approvalVersion) reasons.push("approval_version_mismatch");

  return { verified: reasons.length === 0, reasons };
}

export function parseSanitizedAssistantSources(input: unknown): SanitizedAssistantSource[] | null {
  const parsed = z.array(sanitizedAssistantSourceSchema).safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function orderSanitizedSources(sources: SanitizedAssistantSource[]): SanitizedAssistantSource[] {
  return [...sources].sort(
    (left, right) =>
      PUBLIC_SOURCE_PRECEDENCE[left.sourceType] - PUBLIC_SOURCE_PRECEDENCE[right.sourceType] ||
      right.effectiveAt.localeCompare(left.effectiveAt),
  );
}

export interface SourceSelectionContext {
  contract: ExpectedSourceContract;
  scope: AssistantQuestionScope;
  now: string;
}

export interface RejectedAssistantSource {
  id: string | null;
  reasons: string[];
}

export interface SourceSelectionResult {
  eligible: SanitizedAssistantSource[];
  rejected: RejectedAssistantSource[];
}

function sourceMatchesScope(source: SanitizedAssistantSource, requested: AssistantQuestionScope): boolean {
  if (source.scope.global) return true;
  if (requested.kind === "global") return false;

  if (requested.kind === "season") {
    return source.scope.seasonIds.includes(requested.seasonId);
  }

  return (
    source.scope.seasonIds.includes(requested.seasonId) ||
    source.scope.divisionScopes.some(
      ({ seasonId, divisionId }) =>
        seasonId === requested.seasonId && divisionId === requested.divisionId,
    )
  );
}

export function selectEligibleSources(input: unknown, context: SourceSelectionContext): SourceSelectionResult {
  const parsed = z.array(z.unknown()).safeParse(input);
  if (!parsed.success) return { eligible: [], rejected: [{ id: null, reasons: ["invalid_source_payload"] }] };

  const eligible: SanitizedAssistantSource[] = [];
  const rejected: RejectedAssistantSource[] = [];
  const now = Date.parse(context.now);
  if (!Number.isFinite(now)) return { eligible: [], rejected: [{ id: null, reasons: ["invalid_selection_time"] }] };

  for (const candidate of parsed.data) {
    const validated = sanitizedAssistantSourceSchema.safeParse(candidate);
    if (!validated.success) {
      rejected.push({
        id: typeof candidate === "object" && candidate !== null && "id" in candidate && typeof candidate.id === "string"
          ? candidate.id
          : null,
        reasons: ["invalid_source"],
      });
      continue;
    }

    const source = validated.data;
    const reasons: string[] = [];
    if (source.ruleSetId !== context.contract.ruleSetId) reasons.push("rule_set_mismatch");
    if (source.releaseId !== context.contract.releaseId) reasons.push("release_mismatch");
    if (source.approvalVersion !== context.contract.approvalVersion) reasons.push("approval_version_mismatch");
    if (Date.parse(source.effectiveAt) > now) reasons.push("not_yet_effective");
    if (source.expiresAt && Date.parse(source.expiresAt) <= now) reasons.push("expired");
    if (source.status !== "published" || source.supersededBy !== null) reasons.push("superseded");
    if (source.conflictState === "detected" || source.conflictState === "under_review") {
      reasons.push("unresolved_conflict");
    }
    if (!sourceMatchesScope(source, context.scope)) reasons.push("out_of_scope");

    if (reasons.length > 0) rejected.push({ id: source.id, reasons });
    else eligible.push(source);
  }

  return { eligible: orderSanitizedSources(eligible), rejected };
}

const RULEBOOK_CACHE_TTL_MS = 5 * 60 * 1_000;
const RULEBOOK_REQUIRED_MARKERS = ["1.0 purpose", "8.0 seeding", "26.0 rulebook disclaimer"];

let cachedRulebook: { source: SanitizedAssistantSource; expiresAt: number } | null = null;

async function loadPublishedRulebook(): Promise<SanitizedAssistantSource> {
  if (cachedRulebook && cachedRulebook.expiresAt > Date.now()) return cachedRulebook.source;

  const response = await fetch(RULEBOOK_TEXT_EXPORT_URL, {
    cache: "no-store",
    headers: { Accept: "text/plain" },
  });
  if (!response.ok) throw new Error(`Rulebook export returned ${response.status}.`);

  const canonicalText = (await response.text()).trim();
  const normalizedRulebook = canonicalText.toLowerCase();
  if (
    canonicalText.length < 1_000 ||
    canonicalText.length > 50_000 ||
    RULEBOOK_REQUIRED_MARKERS.some((marker) => !normalizedRulebook.includes(marker))
  ) {
    throw new Error("Rulebook export failed validation.");
  }

  const sourceVersion = createHash("sha256").update(canonicalText, "utf8").digest("hex");
  const source = sanitizedAssistantSourceSchema.parse({
    id: "sal-rulebook-google-doc",
    sourceType: "published_rule",
    title: "Serpent Ascension League Rulebook",
    canonicalText,
    ...PUBLIC_ASSISTANT_SOURCE_CONTRACT,
    sourceVersion,
    scope: { global: true, seasonIds: [], divisionScopes: [] },
    effectiveAt: "2026-05-20T20:19:18.637Z",
    expiresAt: null,
    status: "published",
    supersededBy: null,
    conflictState: "none",
    visibility: "public_sanitized",
    publicUrl: RULEBOOK_PUBLIC_URL,
  });

  cachedRulebook = { source, expiresAt: Date.now() + RULEBOOK_CACHE_TTL_MS };
  return source;
}

const APPROVED_PRECEDENTS: SanitizedAssistantSource[] = [
  sanitizedAssistantSourceSchema.parse({
    id: "terra-solar-adaptation",
    sourceType: "sanitized_precedent",
    title: "Approved Terra Division adaptation",
    canonicalText:
      "Unless a Terra-specific published rule or approved council ruling says otherwise, Terra follows the Solar Division rules adapted one tier upward. In division-specific rules, Terra takes Solar's role and Solar takes Lunar's lower-division role. If that adaptation creates a conflict or does not clearly resolve a case, SAL admins or the council must review it.",
    ...PUBLIC_ASSISTANT_SOURCE_CONTRACT,
    sourceVersion: "terra-adaptation-v1",
    scope: { global: true, seasonIds: [], divisionScopes: [] },
    effectiveAt: "2026-08-02T00:00:00.000Z",
    expiresAt: null,
    status: "published",
    supersededBy: null,
    conflictState: "none",
    visibility: "public_sanitized",
    publicUrl: "/rules#terra-adaptation",
  }),
];

export function getSanitizedSourceRetriever(): SanitizedSourceRetriever | null {
  return {
    async readiness() {
      await loadPublishedRulebook();
      return {
        ready: true,
        ...PUBLIC_ASSISTANT_SOURCE_CONTRACT,
        sourceCount: 1 + APPROVED_PRECEDENTS.length,
        verifiedAt: new Date().toISOString(),
      };
    },
    async search(input) {
      const candidates: SanitizedAssistantSource[] = [];
      if (input.sourceTypes.includes("published_rule")) candidates.push(await loadPublishedRulebook());
      if (input.sourceTypes.includes("sanitized_precedent")) candidates.push(...APPROVED_PRECEDENTS);
      return candidates.slice(0, input.limit);
    },
  };
}
