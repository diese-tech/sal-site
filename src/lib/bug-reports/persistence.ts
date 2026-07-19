import type {
  BugReportAttachmentReference,
  BugReportStatus,
  BugReportStatusResponse,
  BugReportSubmissionPayload,
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
  /** Finalized single-use claims. Raw image bytes never enter this command. */
  attachments: readonly BugReportAttachmentReference[];
  reporter: BugReportReporterContext;
  /** Opaque receipt from the durable shared limiter. Safe to retain in the audit event. */
  abuseDecisionId: string;
}

export interface PersistedBugReportResult {
  ticketId: string;
  publicTicketId: string;
  status: BugReportStatus;
  reporterAccess:
    | {
        kind: "anonymous";
        /** Returned once, stored only as a hash, and never placed in an outbox row. */
        oneTimeAccessToken: string;
        recoveryCode: string;
      }
    | {
        kind: "signed_in";
      };
  relay: {
    requested: boolean;
    queued: boolean;
  };
}

/**
 * Release B must provide this adapter. A successful resolution means the ticket,
 * access-token hash, finalized attachment claims, initial message, audit entry, and
 * projection outbox rows committed durably in one transaction.
 *
 * The adapter owns these integration seams:
 * - `bug_report.admin_ticket.created` with the private channel payload and direct admin ticket URL
 * - `bug_report.admin_ticket.reply` for channel/thread updates
 * - `bug_report.reporter_dm.requested` and `bug_report.reporter_dm.reply` for the hidden relay
 * - a high-entropy anonymous access token returned once to the route mapper
 *
 * It must atomically consume finalized attachment claims. Staff-channel
 * projections must never contain reporter identity, and no projection may
 * contain the raw anonymous access token.
 */
export interface BugReportPersistence {
  persist(command: PersistBugReportCommand): Promise<PersistedBugReportResult>;
}

export type BugReportStatusAccess =
  | { kind: "anonymous"; accessToken: string }
  | {
      kind: "signed_in";
      authUserId: string;
      discordId: string | null;
    };

export interface ReadBugReportStatusQuery {
  publicTicketId: string;
  access: BugReportStatusAccess;
}

/**
 * Release B must verify the anonymous token hash or authenticated reporter
 * ownership inside the same protected data boundary that owns the ticket.
 * A null result is deliberately indistinguishable from denied access.
 */
export interface BugReportStatusReader {
  read(query: ReadBugReportStatusQuery): Promise<BugReportStatusResponse | null>;
}

/**
 * Deliberately null until Release B supplies transactional persistence and a
 * durable shared rate limiter. Keeping this explicit prevents accidental
 * in-memory or optimistic "success" responses.
 */
export function getBugReportPersistence(): BugReportPersistence | null {
  return null;
}

export function getBugReportStatusReader(): BugReportStatusReader | null {
  return null;
}
