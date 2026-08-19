import { getSupabaseServerClient } from "@/lib/supabase-server";
import { readHostMatchReportReview } from "./read-service";
import {
  consumedTokenResultSchema,
  issuedTokenResultSchema,
  reviseResultSchema,
  submitResultSchema,
} from "./contracts";
import type { HostMatchReportReview } from "@/types/match-report-host";
import type { ExtractedGame } from "@/types/match-report";
import { uploadHostReviewScreenshots } from "./upload-service";
import { extractHostReviewScreenshots } from "./extract-service";

export interface ConsumedHostReviewToken {
  matchReportId: string;
  hostDiscordId: string;
}

export interface MatchReportHostPersistence {
  consumeToken(tokenHash: string): Promise<ConsumedHostReviewToken | null>;
  issueToken(input: {
    matchReportId: string;
    hostDiscordId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  readReview(input: {
    matchReportId: string;
    hostDiscordId: string;
  }): Promise<HostMatchReportReview | null>;
  reviseReview(input: {
    matchReportId: string;
    hostDiscordId: string;
    expectedRevision: number;
    games: ExtractedGame[];
  }): Promise<ReturnType<typeof reviseResultSchema.parse>>;
  submitReview(input: {
    matchReportId: string;
    hostDiscordId: string;
    expectedRevision: number;
  }): Promise<ReturnType<typeof submitResultSchema.parse>>;
  uploadScreenshots(input: {
    matchReportId: string;
    hostDiscordId: string;
    files: File[];
  }): Promise<{ urls: string[]; allUrls: string[]; revision: number }>;
  extractReview(input: {
    matchReportId: string;
    hostDiscordId: string;
  }): Promise<HostMatchReportReview>;
}

type UntypedRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export function getMatchReportHostPersistence(): MatchReportHostPersistence | null {
  const client = getSupabaseServerClient();
  if (!client) return null;
  const rpc = client as unknown as UntypedRpcClient;
  return {
    extractReview: (input) => extractHostReviewScreenshots(client, input),
    uploadScreenshots: (input) => uploadHostReviewScreenshots(client, input),
    readReview: (input) => readHostMatchReportReview(client, input),
    async reviseReview(input) {
      const { data, error } = await rpc.rpc("revise_match_report_extraction", {
        p_match_report_id: input.matchReportId,
        p_host_discord_id: input.hostDiscordId,
        p_expected_revision: input.expectedRevision,
        p_games: input.games,
      });
      if (error) throw error;
      return reviseResultSchema.parse(data);
    },
    async submitReview(input) {
      const { data, error } = await rpc.rpc("submit_match_report_host_review", {
        p_match_report_id: input.matchReportId,
        p_host_discord_id: input.hostDiscordId,
        p_expected_revision: input.expectedRevision,
      });
      if (error) throw error;
      return submitResultSchema.parse(data);
    },
    async issueToken(input) {
      const { data, error } = await rpc.rpc("issue_match_report_host_token", {
        p_match_report_id: input.matchReportId,
        p_host_discord_id: input.hostDiscordId,
        p_token_hash: input.tokenHash,
        p_expires_at: input.expiresAt,
      });
      if (error) throw error;
      issuedTokenResultSchema.parse(data);
    },
    async consumeToken(tokenHash) {
      const { data, error } = await rpc.rpc("consume_match_report_host_token", {
        p_token_hash: tokenHash,
      });
      if (error) throw error;
      return consumedTokenResultSchema.parse(data);
    },
  };
}
