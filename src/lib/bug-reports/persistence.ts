import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BugReportAttachmentReference,
  BugReportStatus,
  BugReportStatusResponse,
  BugReportSubmissionPayload,
} from "@/types/bug-report";
import type { Database, Json } from "@/types/database.types";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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

export function getBugReportPersistence(): BugReportPersistence | null {
  const client = getSupabaseServerClient();
  return client ? createDatabaseBugReportPersistence(client) : null;
}

export function getBugReportStatusReader(): BugReportStatusReader | null {
  const client = getSupabaseServerClient();
  return client ? createDatabaseBugReportStatusReader(client) : null;
}

export function createDatabaseBugReportPersistence(
  client: SupabaseClient<Database>,
): BugReportPersistence {
  return {
    async persist(command) {
      if (command.attachments.length > 0) {
        throw new Error("Screenshot intake is not enabled for this release.");
      }
      if (command.payload.replyRelayConsent || command.reporter.kind !== "anonymous") {
        throw new Error("Private reply relay is not enabled for this release.");
      }

      const ticketId = `BUG-${randomBytes(6).toString("hex").toUpperCase()}`;
      const publicTicketId = randomBytes(24).toString("base64url");
      const oneTimeAccessToken = randomBytes(32).toString("base64url");
      const recoveryCode = `SAL-${randomBytes(4).toString("hex").toUpperCase()}`;

      const { data, error } = await client.rpc("create_bug_report", {
        p_abuse_decision_id: command.abuseDecisionId,
        p_ticket_id: ticketId,
        p_public_ticket_id: publicTicketId,
        p_category: command.payload.category,
        p_severity: command.payload.severity,
        p_subject: command.payload.subject,
        p_description: command.payload.description,
        p_reproduction_steps: command.payload.reproductionSteps,
        p_expected_behavior: command.payload.expectedBehavior,
        ...(command.payload.environment
          ? { p_environment: command.payload.environment }
          : {}),
        p_anonymous_access_token_hash: sha256(oneTimeAccessToken),
        p_recovery_code_hash: sha256(recoveryCode),
        p_reply_relay_consent: false,
      });
      if (error) throw error;

      const persisted = readCreatedReport(data);
      if (
        !persisted ||
        persisted.ticketId !== ticketId ||
        persisted.publicTicketId !== publicTicketId ||
        persisted.status !== "open"
      ) {
        throw new Error("Bug report storage returned an invalid receipt.");
      }

      return {
        ...persisted,
        reporterAccess: {
          kind: "anonymous",
          oneTimeAccessToken,
          recoveryCode,
        },
        relay: { requested: false, queued: false },
      };
    },
  };
}

export function createDatabaseBugReportStatusReader(
  client: SupabaseClient<Database>,
): BugReportStatusReader {
  return {
    async read(query) {
      const { data, error } = await client.rpc("read_bug_report_status", {
        p_public_ticket_id: query.publicTicketId,
        ...(query.access.kind === "anonymous"
          ? { p_access_token_hash: sha256(query.access.accessToken) }
          : { p_auth_user_id: query.access.authUserId }),
      });
      if (error) throw error;
      return data as BugReportStatusResponse | null;
    },
  };
}

function readCreatedReport(value: Json): {
  ticketId: string;
  publicTicketId: string;
  status: BugReportStatus;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, Json | undefined>;
  if (
    typeof candidate.ticketId !== "string" ||
    typeof candidate.publicTicketId !== "string" ||
    candidate.status !== "open"
  ) {
    return null;
  }
  return {
    ticketId: candidate.ticketId,
    publicTicketId: candidate.publicTicketId,
    status: candidate.status,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
