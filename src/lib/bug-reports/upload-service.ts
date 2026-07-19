import type {
  BugReportAttachmentDescriptor,
  BugReportAttachmentReference,
  BugReportUploadSessionReceipt,
} from "@/types/bug-report";
import { BUG_REPORT_ATTACHMENT_LIMITS } from "./contracts";

export interface CreateBugReportUploadSessionCommand {
  files: readonly BugReportAttachmentDescriptor[];
  abuseDecisionId: string;
}

export interface FinalizeBugReportUploadCommand {
  uploadId: string;
  finalizationToken: string;
}

/**
 * Release B supplies this adapter. Upload URLs must target a private quarantine
 * prefix directly, so image bytes never pass through a Vercel Function.
 *
 * `finalizeUpload` must inspect the object from trusted storage metadata, not
 * client declarations. Before returning an opaque reference it must:
 * - enforce the stored byte size and the declared JPEG/PNG/WebP format;
 * - calculate and retain a SHA-256 digest;
 * - fully decode the image and reject malformed files and decompression bombs;
 * - enforce width, height, and pixel limits from BUG_REPORT_ATTACHMENT_LIMITS;
 * - re-encode to a private sanitized object, stripping all metadata;
 * - delete the quarantined original; and
 * - store only a hash of the single-use opaque claim returned to the client.
 *
 * Persistence may claim only finalized, unexpired, unclaimed references. It
 * must bind them to the ticket in the same transaction as the initial message,
 * audit event, and outbox rows.
 */
export interface BugReportUploadService {
  readonly limits: typeof BUG_REPORT_ATTACHMENT_LIMITS;
  createSession(command: CreateBugReportUploadSessionCommand): Promise<BugReportUploadSessionReceipt>;
  finalizeUpload(command: FinalizeBugReportUploadCommand): Promise<BugReportAttachmentReference>;
}

export function getBugReportUploadService(): BugReportUploadService | null {
  return null;
}
