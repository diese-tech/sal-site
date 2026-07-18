import type { BugReportFile } from "./contracts";
import type {
  BugReportAttachmentDescriptor,
  BugReportSubmissionPayload,
  BugReportSubmissionReceipt,
} from "@/types/bug-report";

export type BugReportReporterContext =
  | { kind: "anonymous" }
  | {
      kind: "signed_in";
      authUserId: string;
      discordId: string | null;
    };

export interface PersistBugReportCommand {
  payload: BugReportSubmissionPayload;
  attachments: readonly BugReportFile[];
  attachmentDescriptors: readonly BugReportAttachmentDescriptor[];
  reporter: BugReportReporterContext;
  /** Opaque receipt from the durable shared limiter. Safe to retain in the audit event. */
  abuseDecisionId: string;
}

/**
 * Release B must provide this adapter. A successful resolution means the ticket,
 * access-token hash, attachment records, initial message, audit entry, and
 * projection outbox rows committed durably in one transaction.
 *
 * The adapter owns these integration seams:
 * - `bug_report.admin_ticket.created` with the private channel payload and direct admin ticket URL
 * - `bug_report.admin_ticket.reply` for channel/thread updates
 * - `bug_report.reporter_dm.requested` and `bug_report.reporter_dm.reply` for the hidden relay
 * - a high-entropy anonymous access token returned only in the reporter receipt
 *
 * It must strip image metadata before private object storage and must never put
 * reporter identity or the raw access token in Discord projection payloads.
 */
export interface BugReportPersistence {
  persist(command: PersistBugReportCommand): Promise<BugReportSubmissionReceipt>;
}

/**
 * Deliberately null until Release B supplies transactional persistence and a
 * durable shared rate limiter. Keeping this explicit prevents accidental
 * in-memory or optimistic "success" responses.
 */
export function getBugReportPersistence(): BugReportPersistence | null {
  return null;
}
