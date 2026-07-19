import { z } from "zod";
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_SEVERITIES,
  type BugReportAttachmentDescriptor,
  type BugReportAttachmentReference,
  type BugReportErrorCode,
  type BugReportStatusResponse,
  type BugReportSubmissionPayload,
  type BugReportUploadSessionReceipt,
} from "@/types/bug-report";
import type {
  BugReportReporterContext,
  PersistedBugReportResult,
} from "./persistence";

export const BUG_REPORT_ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxBytesPerFile: 20 * 1024 * 1024,
  maxBytesPerSession: 100 * 1024 * 1024,
  maxWidth: 16_384,
  maxHeight: 16_384,
  maxPixels: 40_000_000,
  acceptedMediaTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

export const BUG_REPORT_CATEGORY_OPTIONS: ReadonlyArray<{
  value: (typeof BUG_REPORT_CATEGORIES)[number];
  label: string;
  description: string;
}> = [
  { value: "website", label: "Website", description: "Pages, forms, links, or display problems" },
  { value: "salbot", label: "SALbot", description: "Commands, Discord messages, or bot behavior" },
  { value: "account", label: "Account", description: "Sign-in, profile claiming, or access" },
  { value: "stats_data", label: "Stats or data", description: "Incorrect standings, players, or match data" },
  { value: "scout_match_report", label: "Scout or match report", description: "Screenshot intake or game reporting" },
  { value: "rules_ruling", label: "Rules or ruling", description: "Rules page or ruling workflow problems" },
  { value: "other", label: "Other", description: "Anything that does not fit above" },
];

export const BUG_REPORT_SEVERITY_OPTIONS: ReadonlyArray<{
  value: (typeof BUG_REPORT_SEVERITIES)[number];
  label: string;
  description: string;
}> = [
  { value: "low", label: "Low", description: "Cosmetic or minor inconvenience" },
  { value: "normal", label: "Normal", description: "A feature is not working as expected" },
  { value: "high", label: "High", description: "Blocks an important league task" },
  { value: "critical", label: "Critical", description: "Active game-day, security, or data-loss risk" },
];

const optionalTrimmedText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const payloadSchema = z.object({
  category: z.enum(BUG_REPORT_CATEGORIES),
  severity: z.enum(BUG_REPORT_SEVERITIES),
  subject: z.string().trim().min(8, "Give the report a short, specific subject.").max(120),
  description: z.string().trim().min(20, "Describe what happened in at least 20 characters.").max(5_000),
  reproductionSteps: z.string().trim().min(10, "Add the steps that caused the problem.").max(3_000),
  expectedBehavior: z.string().trim().min(10, "Explain what you expected to happen.").max(2_000),
  environment: optionalTrimmedText(500),
  replyRelayConsent: z.boolean(),
});

export type BugReportPayloadParseResult =
  | { success: true; data: BugReportSubmissionPayload }
  | {
      success: false;
      fieldErrors: Partial<Record<keyof BugReportSubmissionPayload, string>>;
    };

export function parseBugReportPayload(input: unknown): BugReportPayloadParseResult {
  const parsed = payloadSchema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };

  const fieldErrors: Partial<Record<keyof BugReportSubmissionPayload, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof BugReportSubmissionPayload] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}

export interface BugReportFile {
  name: string;
  type: string;
  size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export type BugReportAttachmentValidationResult =
  | { success: true }
  | { success: false; code: BugReportErrorCode; message: string };

export async function validateBugReportAttachments(
  files: readonly BugReportFile[],
): Promise<BugReportAttachmentValidationResult> {
  if (files.length > BUG_REPORT_ATTACHMENT_LIMITS.maxFiles) {
    return {
      success: false,
      code: "too_many_files",
      message: `Attach no more than ${BUG_REPORT_ATTACHMENT_LIMITS.maxFiles} images.`,
    };
  }

  for (const file of files) {
    if (!BUG_REPORT_ATTACHMENT_LIMITS.acceptedMediaTypes.includes(file.type as never)) {
      return {
        success: false,
        code: "unsupported_file_type",
        message: `${file.name} must be a JPEG, PNG, or WebP image.`,
      };
    }
    if (file.size <= 0 || file.size > BUG_REPORT_ATTACHMENT_LIMITS.maxBytesPerFile) {
      return {
        success: false,
        code: "file_too_large",
        message: `${file.name} must be smaller than 20 MB.`,
      };
    }

    // Client-side UX check only. The upload finalizer must decode and re-encode
    // the stored object before it can produce a consumable opaque reference.
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!hasMatchingImageSignature(file.type, bytes)) {
      return {
        success: false,
        code: "invalid_file_content",
        message: `${file.name} does not contain a valid ${mediaTypeLabel(file.type)} image.`,
      };
    }
  }

  return { success: true };
}

const attachmentDescriptorSchema = z.object({
  name: z.string().trim().min(1).max(255).refine(
    (name) => !/[\u0000-\u001f\u007f]/.test(name),
    "File names cannot contain control characters.",
  ),
  mediaType: z.enum(BUG_REPORT_ATTACHMENT_LIMITS.acceptedMediaTypes),
  size: z.number().int().positive().max(BUG_REPORT_ATTACHMENT_LIMITS.maxBytesPerFile),
});

const attachmentReferenceSchema = z.object({
  opaqueRef: z.string().min(32).max(512).regex(/^brup_[A-Za-z0-9_-]+$/),
});

export type BugReportAttachmentMetadataParseResult =
  | { success: true; data: BugReportAttachmentDescriptor[] }
  | { success: false; code: BugReportErrorCode; message: string };

export function parseBugReportAttachmentMetadata(
  input: unknown,
): BugReportAttachmentMetadataParseResult {
  const parsed = z.array(attachmentDescriptorSchema).min(1).max(
    BUG_REPORT_ATTACHMENT_LIMITS.maxFiles,
  ).safeParse(input);
  if (
    parsed.success &&
    parsed.data.reduce((total, file) => total + file.size, 0) <=
      BUG_REPORT_ATTACHMENT_LIMITS.maxBytesPerSession
  ) {
    return { success: true, data: parsed.data };
  }
  return {
    success: false,
    code: "invalid_request",
    message: `Choose between 1 and ${BUG_REPORT_ATTACHMENT_LIMITS.maxFiles} valid images.`,
  };
}

export type BugReportAttachmentReferencesParseResult =
  | { success: true; data: BugReportAttachmentReference[] }
  | { success: false; code: BugReportErrorCode; message: string };

export function parseBugReportAttachmentReferences(
  input: unknown,
): BugReportAttachmentReferencesParseResult {
  const parsed = z.array(attachmentReferenceSchema).max(
    BUG_REPORT_ATTACHMENT_LIMITS.maxFiles,
  ).superRefine((references, context) => {
    if (new Set(references.map((reference) => reference.opaqueRef)).size !== references.length) {
      context.addIssue({ code: "custom", message: "Attachment references must be unique." });
    }
  }).safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  return {
    success: false,
    code: "invalid_upload_reference",
    message: "One or more uploaded image references are invalid or duplicated.",
  };
}

const uploadTargetAdapterSchema = z.object({
  uploadId: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
  uploadUrl: z.url(),
  method: z.literal("PUT"),
  requiredHeaders: z.record(z.string(), z.string()),
  finalizationToken: z.string().min(32).max(512),
  expiresAt: z.iso.datetime(),
});

const uploadSessionAdapterSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
  targets: z.array(uploadTargetAdapterSchema).min(1).max(BUG_REPORT_ATTACHMENT_LIMITS.maxFiles),
  expiresAt: z.iso.datetime(),
});

export type BugReportUploadSessionAdapterParseResult =
  | { success: true; data: Omit<BugReportUploadSessionReceipt, "allowedUploadHosts"> }
  | { success: false; message: string };

export function parseBugReportUploadSessionAdapterResult(
  input: unknown,
  expectedTargets: number,
  now: Date,
): BugReportUploadSessionAdapterParseResult {
  const parsed = uploadSessionAdapterSchema.safeParse(input);
  if (!parsed.success || parsed.data.targets.length !== expectedTargets) {
    return { success: false, message: "Private storage returned an invalid upload session." };
  }

  const nowMs = now.getTime();
  const latestExpiry = nowMs + 15 * 60 * 1_000;
  const expiries = [parsed.data.expiresAt, ...parsed.data.targets.map((target) => target.expiresAt)];
  if (
    expiries.some((value) => {
      const expiry = Date.parse(value);
      return !Number.isFinite(expiry) || expiry <= nowMs || expiry > latestExpiry;
    })
  ) {
    return { success: false, message: "Private storage returned an unsafe upload expiry." };
  }

  for (const target of parsed.data.targets) {
    const headers = Object.entries(target.requiredHeaders);
    const allowedHeaderNames = new Set(["content-type", "cache-control", "x-upsert"]);
    if (
      headers.length === 0 ||
      headers.length > 16 ||
      headers.some(
        ([name, value]) =>
          !/^[a-z0-9-]+$/.test(name) ||
          !allowedHeaderNames.has(name) ||
          value.length > 1_024 ||
          name === "authorization" ||
          name === "cookie",
      )
    ) {
      return { success: false, message: "Private storage returned unsafe upload headers." };
    }
  }

  return { success: true, data: parsed.data };
}

export function parseBugReportFinalizationAdapterResult(
  input: unknown,
): { success: true; data: BugReportAttachmentReference } | { success: false; message: string } {
  const parsed = attachmentReferenceSchema.safeParse(input);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, message: "Private storage returned an invalid finalized reference." };
}

const anonymousAccessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43,256}$/);

const anonymousReporterAccessSchema = z.object({
  kind: z.literal("anonymous"),
  // 43 base64url characters carry at least 256 bits when generated uniformly.
  oneTimeAccessToken: anonymousAccessTokenSchema,
  recoveryCode: z.string().regex(/^[A-Z0-9-]{8,64}$/),
}).strict();

const signedInReporterAccessSchema = z.object({
  kind: z.literal("signed_in"),
}).strict();

const publicTicketIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22,160}$/);

const persistedBugReportResultSchema = z.object({
  ticketId: z.string().regex(/^[A-Z][A-Z0-9-]{7,63}$/),
  // Public route identifiers are opaque and must contain at least 128 bits
  // when generated uniformly as base64url.
  publicTicketId: publicTicketIdSchema,
  status: z.enum([
    "open",
    "acknowledged",
    "waiting_on_reporter",
    "investigating",
    "resolved",
    "no_response",
  ]),
  reporterAccess: z.discriminatedUnion("kind", [
    anonymousReporterAccessSchema,
    signedInReporterAccessSchema,
  ]),
  relay: z.object({
    requested: z.boolean(),
    queued: z.boolean(),
  }).strict(),
}).strict();

export type PersistedBugReportResultParseResult =
  | { success: true; data: PersistedBugReportResult }
  | { success: false; message: string };

export function parsePersistedBugReportResult(
  input: unknown,
  expectedReporter: BugReportReporterContext,
  replyRelayConsent: boolean,
): PersistedBugReportResultParseResult {
  const parsed = persistedBugReportResultSchema.safeParse(input);
  if (!parsed.success || parsed.data.ticketId === parsed.data.publicTicketId) {
    return { success: false, message: "Ticket storage returned an invalid receipt." };
  }

  if (
    parsed.data.reporterAccess.kind === "anonymous" &&
    (parsed.data.publicTicketId.includes(parsed.data.reporterAccess.oneTimeAccessToken) ||
      parsed.data.ticketId.includes(parsed.data.reporterAccess.oneTimeAccessToken) ||
      parsed.data.reporterAccess.recoveryCode.includes(
        parsed.data.reporterAccess.oneTimeAccessToken,
      ))
  ) {
    return { success: false, message: "Ticket storage returned an exposed access token." };
  }

  const expectsSignedRelay =
    replyRelayConsent &&
    expectedReporter.kind === "signed_in" &&
    Boolean(expectedReporter.discordId);
  const accessMatches = expectsSignedRelay
    ? parsed.data.reporterAccess.kind === "signed_in"
    : parsed.data.reporterAccess.kind === "anonymous";
  const relayMatches = expectsSignedRelay
    ? parsed.data.relay.requested && parsed.data.relay.queued
    : !parsed.data.relay.requested && !parsed.data.relay.queued;

  if (!accessMatches || !relayMatches) {
    return { success: false, message: "Ticket storage returned an inconsistent receipt." };
  }

  return { success: true, data: parsed.data };
}

export function parsePublicBugReportTicketId(input: unknown): string | null {
  const parsed = publicTicketIdSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function parseAnonymousBugReportAccessToken(input: unknown): string | null {
  const parsed = anonymousAccessTokenSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

const bugReportStatusResponseSchema = z.object({
  ticketId: z.string().regex(/^[A-Z][A-Z0-9-]{7,63}$/),
  status: z.enum([
    "open",
    "acknowledged",
    "waiting_on_reporter",
    "investigating",
    "resolved",
    "no_response",
  ]),
  updatedAt: z.iso.datetime(),
  messages: z.array(z.object({
    id: z.string().min(1).max(160),
    direction: z.enum(["reporter_to_admin", "admin_to_reporter"]),
    message: z.string().min(1).max(5_000),
    deliveryStatus: z.enum(["queued", "delivered", "failed"]),
    createdAt: z.iso.datetime(),
  }).strict()).max(500),
}).strict();

export function parseBugReportStatusResult(
  input: unknown,
): { success: true; data: BugReportStatusResponse } | { success: false } {
  const parsed = bugReportStatusResponseSchema.safeParse(input);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}

export function normalizeCanonicalSiteOrigin(input: unknown): string | null {
  if (typeof input !== "string") return null;
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeAllowedUploadHosts(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 8) return null;
  const hosts = input.map((value) => (typeof value === "string" ? value.toLowerCase() : ""));
  if (
    hosts.some(
      (host) =>
        !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{2,5})?$/.test(host) ||
        host === "localhost" ||
        !host.split(":")[0].includes("."),
    )
  ) {
    return null;
  }
  return [...new Set(hosts)];
}

export function describeBugReportAttachments(
  files: readonly BugReportFile[],
): BugReportAttachmentDescriptor[] {
  return files.map((file) => ({
    name: file.name,
    mediaType: file.type as BugReportAttachmentDescriptor["mediaType"],
    size: file.size,
  }));
}

function hasMatchingImageSignature(mediaType: string, bytes: Uint8Array): boolean {
  if (mediaType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  if (mediaType === "image/webp") {
    return textAt(bytes, 0, "RIFF") && textAt(bytes, 8, "WEBP");
  }
  return false;
}

function textAt(bytes: Uint8Array, offset: number, expected: string): boolean {
  return [...expected].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function mediaTypeLabel(mediaType: string): string {
  return mediaType.replace("image/", "").toUpperCase();
}
