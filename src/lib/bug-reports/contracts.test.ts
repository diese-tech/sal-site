import { describe, expect, it } from "vitest";
import {
  BUG_REPORT_ATTACHMENT_LIMITS,
  parseBugReportPayload,
  validateBugReportAttachments,
} from "./contracts";

const validPayload = {
  category: "website",
  severity: "normal",
  subject: "Standings page does not load",
  description: "The standings page stays blank after I select the current season.",
  reproductionSteps: "1. Open standings\n2. Select the current season\n3. Wait for the page",
  expectedBehavior: "The current standings should appear.",
  environment: "Chrome on Windows 11",
  replyRelayConsent: false,
};

function imageFile(bytes: number[], overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  const content = Uint8Array.from(bytes);
  return {
    name: overrides.name ?? "evidence.png",
    type: overrides.type ?? "image/png",
    size: overrides.size ?? content.byteLength,
    arrayBuffer: async () => content.buffer,
  };
}

describe("bug report submission contract", () => {
  it("accepts a complete anonymous report and normalizes optional text", () => {
    const parsed = parseBugReportPayload({
      ...validPayload,
      subject: `  ${validPayload.subject}  `,
      environment: "   ",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.subject).toBe(validPayload.subject);
    expect(parsed.data.environment).toBeUndefined();
    expect(parsed.data.replyRelayConsent).toBe(false);
  });

  it("returns stable field errors for unsupported categories and short descriptions", () => {
    const parsed = parseBugReportPayload({
      ...validPayload,
      category: "billing",
      description: "broken",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.fieldErrors.category).toBeDefined();
    expect(parsed.fieldErrors.description).toBeDefined();
  });

  it("accepts files only when the declared type and actual image signature agree", async () => {
    const result = await validateBugReportAttachments([
      imageFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ]);

    expect(result).toEqual({ success: true });
  });

  it("rejects spoofed and oversized attachments without trusting the extension", async () => {
    const spoofed = await validateBugReportAttachments([
      imageFile([0x4d, 0x5a, 0x90], { name: "report.png" }),
    ]);
    const oversized = await validateBugReportAttachments([
      imageFile([0xff, 0xd8, 0xff], {
        name: "large.jpg",
        type: "image/jpeg",
        size: BUG_REPORT_ATTACHMENT_LIMITS.maxBytesPerFile + 1,
      }),
    ]);

    expect(spoofed).toMatchObject({ success: false, code: "invalid_file_content" });
    expect(oversized).toMatchObject({ success: false, code: "file_too_large" });
  });

  it("rejects more than five attachments", async () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const result = await validateBugReportAttachments(
      Array.from({ length: BUG_REPORT_ATTACHMENT_LIMITS.maxFiles + 1 }, (_, index) =>
        imageFile(png, { name: `evidence-${index}.png` }),
      ),
    );

    expect(result).toMatchObject({ success: false, code: "too_many_files" });
  });
});
