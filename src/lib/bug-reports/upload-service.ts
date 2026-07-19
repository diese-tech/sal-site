import type { BugReportAttachmentDescriptor } from "@/types/bug-report";
import { BUG_REPORT_ATTACHMENT_LIMITS } from "./contracts";

export interface CreateBugReportUploadSessionCommand {
  files: readonly BugReportAttachmentDescriptor[];
  abuseDecisionId: string;
}

export interface FinalizeBugReportUploadCommand {
  uploadId: string;
  finalizationToken: string;
  abuseDecisionId: string;
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
 * Session creation must enforce limits at storage ingress, not only in site
 * validation: each signed PUT is bound to its exact declared content type and
 * maximum object size, the full session is capped at maxBytesPerSession, and
 * tenant/IP quotas are reserved before grants are issued. URLs expire within
 * 15 minutes and target server-generated opaque quarantine paths that never
 * contain the client filename. Unfinalized objects are deleted automatically
 * at expiry.
 *
 * Finalization tokens are stored only as keyed hashes and compared in constant
 * time. They are bound to one session and upload ID, expire within 15 minutes,
 * and become consumed before storage download/decode begins; replays fail
 * without touching object storage.
 *
 * Persistence may claim only finalized, unexpired, unclaimed references. It
 * must bind them to the ticket in the same transaction as the initial message,
 * audit event, and outbox rows.
 */
export interface BugReportUploadService {
  readonly limits: typeof BUG_REPORT_ATTACHMENT_LIMITS;
  /** Untrusted adapter output. Route handlers must runtime-validate and map it. */
  createSession(command: CreateBugReportUploadSessionCommand): Promise<unknown>;
  /** Untrusted adapter output. Route handlers must runtime-validate and map it. */
  finalizeUpload(command: FinalizeBugReportUploadCommand): Promise<unknown>;
}

export function getBugReportUploadService(): BugReportUploadService | null {
  return null;
}
