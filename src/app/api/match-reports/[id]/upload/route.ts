import { NextRequest } from "next/server";
import { z } from "zod";
import { getHostReviewSessionFromRequest, type HostReviewSession } from "@/lib/match-report-host/auth";
import {
  getCanonicalSiteOrigin,
  hostReviewJson,
  privateHostReviewNotFound,
  requestUsesCanonicalOrigin,
} from "@/lib/match-report-host/http";
import { getMatchReportHostPersistence } from "@/lib/match-report-host/persistence";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type UploadResult = { urls: string[]; allUrls: string[]; revision: number };
export interface HostReviewUploadDependencies {
  canonicalSiteOrigin: string | null;
  getSession: (request: NextRequest, reportId: string) => HostReviewSession | null;
  upload: (input: {
    matchReportId: string;
    hostDiscordId: string;
    files: File[];
  }) => Promise<UploadResult>;
}

export function createHostReviewUploadHandler(dependencies: HostReviewUploadDependencies) {
  return async function POST(request: NextRequest, context: RouteContext) {
    if (
      !dependencies.canonicalSiteOrigin ||
      !requestUsesCanonicalOrigin(request, dependencies.canonicalSiteOrigin)
    ) return privateHostReviewNotFound();
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return privateHostReviewNotFound();
    const session = dependencies.getSession(request, id);
    if (!session) return privateHostReviewNotFound();
    const form = await request.formData().catch(() => null);
    if (!form) return hostReviewJson({ error: "Invalid screenshot upload." }, 400);
    const files = form.getAll("screenshots").filter((value): value is File => value instanceof File);

    try {
      return hostReviewJson(await dependencies.upload({
        matchReportId: id,
        hostDiscordId: session.hostDiscordId,
        files,
      }));
    } catch (error) {
      const code = databaseCode(error);
      if (code === "P0002" || code === "PGRST116" || code === "42501") return privateHostReviewNotFound();
      if (code === "22023") return hostReviewJson({ error: errorMessage(error, "Invalid screenshot upload.") }, 400);
      if (code === "40001") return hostReviewJson({ error: "This report changed in another tab. Reload and try again." }, 409);
      return hostReviewJson({ error: "Screenshot upload failed." }, 503);
    }
  };
}

function databaseCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const persistence = getMatchReportHostPersistence();
export const POST = createHostReviewUploadHandler({
  canonicalSiteOrigin: getCanonicalSiteOrigin(),
  getSession: getHostReviewSessionFromRequest,
  upload: async (input) => {
    if (!persistence) throw new Error("Supabase not configured.");
    return persistence.uploadScreenshots(input);
  },
});
