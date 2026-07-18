import { z } from "zod";
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_SEVERITIES,
  type BugReportAttachmentDescriptor,
  type BugReportErrorCode,
  type BugReportSubmissionPayload,
} from "@/types/bug-report";

export const BUG_REPORT_ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxBytesPerFile: 20 * 1024 * 1024,
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
  arrayBuffer(): Promise<ArrayBuffer>;
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

    const bytes = new Uint8Array(await file.arrayBuffer()).slice(0, 12);
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
