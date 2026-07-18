import type { AssistantSourceType } from "@/types/public-assistant";

export const PUBLIC_SOURCE_PRECEDENCE: Record<AssistantSourceType, number> = {
  published_rule: 1,
  sanitized_precedent: 2,
  public_faq: 3,
};

export interface SanitizedAssistantSource {
  id: string;
  sourceType: AssistantSourceType;
  title: string;
  canonicalText: string;
  version: string;
  effectiveAt: string;
  publicUrl: string;
  status: "published";
  visibility: "public_sanitized";
}

export interface SanitizedSourceSearch {
  question: string;
  limit: number;
  sourceTypes: AssistantSourceType[];
}

export interface SanitizedSourceRetriever {
  readiness(): Promise<{ ready: boolean; sourceVersion: string | null }>;
  search(input: SanitizedSourceSearch): Promise<SanitizedAssistantSource[]>;
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
