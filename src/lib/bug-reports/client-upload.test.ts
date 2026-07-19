import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDirectUploadTarget, uploadBugReportAttachments } from "./client-upload";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("direct bug-report attachment upload", () => {
  it("sends bytes only to the signed private target and returns a finalized opaque claim", async () => {
    const file = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], "evidence.png", {
      type: "image/png",
    });
    const attachment = { opaqueRef: `brup_${"c".repeat(48)}` };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            uploadSession: {
              sessionId: "upload-session-0001",
              expiresAt: "2026-07-19T00:15:00.000Z",
              allowedUploadHosts: ["storage.example"],
              targets: [
                {
                  uploadId: "upload-object-0000001",
                  uploadUrl: "https://storage.example/private-signed-upload",
                  method: "PUT",
                  requiredHeaders: { "content-type": "image/png" },
                  finalizationToken: "f".repeat(48),
                  expiresAt: "2026-07-19T00:15:00.000Z",
                },
              ],
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, attachment }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadBugReportAttachments([file])).resolves.toEqual([attachment]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/bug-reports/uploads",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          files: [{ name: "evidence.png", mediaType: "image/png", size: file.size }],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://storage.example/private-signed-upload",
      expect.objectContaining({ method: "PUT", body: file, credentials: "omit" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bug-reports/uploads/upload-object-0000001/finalize",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects non-HTTPS, localhost, and arbitrary HTTPS upload targets", () => {
    expect(() => assertDirectUploadTarget("ftp://storage.example/file", ["storage.example"])).toThrow();
    expect(() => assertDirectUploadTarget("https://localhost/file", ["localhost"])).toThrow();
    expect(() =>
      assertDirectUploadTarget("https://attacker.example/file", ["storage.example"]),
    ).toThrow();
    expect(() =>
      assertDirectUploadTarget("https://storage.example/file", ["storage.example"]),
    ).not.toThrow();
  });
});
