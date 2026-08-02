export const RULEBOOK_DOCUMENT_ID = "1bL0i2Wrfjt0q3jauPDqoBweOOXdkJWMWqfp9nngPjjU";

export const RULEBOOK_PUBLIC_URL =
  `https://docs.google.com/document/d/${RULEBOOK_DOCUMENT_ID}/edit?tab=t.0#heading=h.mf7wvm9z1scn`;

export const RULEBOOK_TEXT_EXPORT_URL =
  `https://docs.google.com/document/d/${RULEBOOK_DOCUMENT_ID}/export?format=txt`;

export const RULEBOOK_EMBED_URL =
  `https://docs.google.com/document/d/${RULEBOOK_DOCUMENT_ID}/preview?tab=t.0`;

export const PUBLIC_ASSISTANT_SOURCE_CONTRACT = {
  ruleSetId: "sal-official-rules",
  releaseId: "google-doc-t0",
  approvalVersion: "public-sources-v1",
} as const;
