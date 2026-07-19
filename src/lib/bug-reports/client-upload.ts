import type {
  BugReportAttachmentReference,
  BugReportUploadFinalizationResponse,
  BugReportUploadSessionResponse,
} from "@/types/bug-report";

export async function uploadBugReportAttachments(
  files: readonly File[],
): Promise<BugReportAttachmentReference[]> {
  if (files.length === 0) return [];

  const sessionResponse = await fetch("/api/bug-reports/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      files: files.map((file) => ({
        name: file.name,
        mediaType: file.type,
        size: file.size,
      })),
    }),
  });
  const sessionResult = (await readJson(sessionResponse)) as BugReportUploadSessionResponse;
  if (!sessionResponse.ok || !sessionResult.ok) {
    throw new Error(
      !sessionResult.ok ? sessionResult.message : "Private image upload is unavailable.",
    );
  }
  if (sessionResult.uploadSession.targets.length !== files.length) {
    throw new Error("Private upload storage returned an incomplete upload session.");
  }

  const finalized: BugReportAttachmentReference[] = [];
  for (const [index, file] of files.entries()) {
    const target = sessionResult.uploadSession.targets[index];
    assertDirectUploadTarget(target.uploadUrl);
    const uploadResponse = await fetch(target.uploadUrl, {
      method: target.method,
      headers: target.requiredHeaders,
      body: file,
      credentials: "omit",
    });
    if (!uploadResponse.ok) {
      throw new Error(`${file.name} could not be uploaded to private storage.`);
    }

    const finalizeResponse = await fetch(
      `/api/bug-reports/uploads/${encodeURIComponent(target.uploadId)}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ finalizationToken: target.finalizationToken }),
      },
    );
    const finalizeResult = (await readJson(
      finalizeResponse,
    )) as BugReportUploadFinalizationResponse;
    if (!finalizeResponse.ok || !finalizeResult.ok) {
      throw new Error(
        !finalizeResult.ok
          ? finalizeResult.message
          : `${file.name} did not pass private image validation.`,
      );
    }
    finalized.push(finalizeResult.attachment);
  }

  return finalized;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { ok: false, message: "The upload service returned an invalid response." };
  }
}

function assertDirectUploadTarget(uploadUrl: string) {
  const url = new URL(uploadUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Private upload storage returned an unsafe upload target.");
  }
}
