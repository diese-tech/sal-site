import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const MAX_SCREENSHOTS = 5;
// Vercel Functions reject the entire request above 4.5 MB. One file per
// multipart request with a 4 MB payload cap leaves room for form overhead.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type ErrorShape = { message: string; code?: string } | null;
type UntypedResult = PromiseLike<{ data: unknown; error: ErrorShape }>;
interface UntypedQuery extends UntypedResult {
  select(columns: string): UntypedQuery;
  eq(column: string, value: unknown): UntypedQuery;
  update(values: Record<string, unknown>): UntypedQuery;
  single(): UntypedResult;
}
type UntypedClient = { from(table: string): UntypedQuery };

function failure(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

export function validateHostReviewScreenshotFiles(existingCount: number, files: File[]) {
  if (files.length !== 1) {
    throw failure("22023", "Upload one screenshot at a time.");
  }
  if (files.length < 1 || existingCount + files.length > MAX_SCREENSHOTS) {
    throw failure("22023", `A report can contain at most ${MAX_SCREENSHOTS} screenshots.`);
  }
  for (const file of files) {
    if (!CONTENT_TYPES[file.type] || file.size < 1 || file.size > MAX_FILE_BYTES) {
      throw failure("22023", "Screenshots must be PNG, JPEG, or WebP files no larger than 4 MB.");
    }
  }
}

export async function uploadHostReviewScreenshots(
  client: SupabaseClient<Database>,
  input: { matchReportId: string; hostDiscordId: string; files: File[] },
) {
  const untyped = client as unknown as UntypedClient;
  const { data: rawReport, error: reportError } = await untyped
    .from("match_reports")
    .select("id,status,revision,screenshot_urls")
    .eq("id", input.matchReportId)
    .eq("host_discord_id", input.hostDiscordId)
    .single();
  if (reportError || !rawReport) throw reportError ?? failure("P0002", "Report not found.");
  const report = rawReport as {
    status: string;
    revision: number;
    screenshot_urls: string[] | null;
  };
  if (report.status === "host_review" || report.status === "done" || report.status === "cancelled") {
    throw failure("42501", "Report is no longer editable.");
  }
  const existingUrls = report.screenshot_urls ?? [];
  validateHostReviewScreenshotFiles(existingUrls.length, input.files);

  const storage = client.storage.from("match-screenshots");
  const storedPaths: string[] = [];
  const newUrls: string[] = [];
  try {
    for (const file of input.files) {
      const path = `${input.matchReportId}/${randomUUID()}.${CONTENT_TYPES[file.type]}`;
      const { error } = await storage.upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      storedPaths.push(path);
      newUrls.push(storage.getPublicUrl(path).data.publicUrl);
    }

    const nextRevision = report.revision + 1;
    const { data: updated, error: updateError } = await untyped
      .from("match_reports")
      .update({
        screenshot_urls: [...existingUrls, ...newUrls],
        status: "pending",
        revision: nextRevision,
      })
      .eq("id", input.matchReportId)
      .eq("host_discord_id", input.hostDiscordId)
      .eq("revision", report.revision)
      .select("revision")
      .single();
    if (updateError || !updated) throw failure("40001", "Report changed during upload.");
    return { urls: newUrls, allUrls: [...existingUrls, ...newUrls], revision: nextRevision };
  } catch (error) {
    if (storedPaths.length > 0) await storage.remove(storedPaths);
    throw error;
  }
}
