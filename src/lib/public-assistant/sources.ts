import { z } from "zod";
import type { AssistantSourceType, PublicSafeModelInput } from "@/types/public-assistant";
import { isSafePublicUrl } from "./safe-url";

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
    divisionIds: z.array(z.string().min(1).max(160)).max(100),
  })
  .strict()
  .superRefine((scope, context) => {
    if (!scope.global && scope.seasonIds.length === 0 && scope.divisionIds.length === 0) {
      context.addIssue({ code: "custom", message: "A non-global source must declare season or division scope." });
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

/**
 * Release B must provide this repository from durable, Admin-approved data.
 * Raw notes, private evidence, individual votes, and confidential facts do not
 * satisfy this interface and must never be passed to the public model.
 */
export function getSanitizedSourceRetriever(): SanitizedSourceRetriever | null {
  return null;
}
