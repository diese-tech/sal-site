import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: vi.fn(() => true) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { POST } from "./route";

const reportId = "22222222-2222-4222-8222-222222222222";
const ctx = { params: Promise.resolve({ id: reportId }) };

function supabaseWithReportStatus(status: string) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const single = vi.fn().mockResolvedValue({
    data: { id: reportId, screenshot_urls: [], status },
    error: null,
  });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single,
    update,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const upload = vi.fn().mockResolvedValue({ error: null });
  return {
    client: {
      from: vi.fn().mockReturnValue(query),
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example/a.png" } }),
        }),
      },
    },
    update,
    upload,
  };
}

function uploadRequest() {
  const form = new FormData();
  form.append("screenshots", new File([new Uint8Array([1, 2, 3])], "score.png", { type: "image/png" }));
  return new NextRequest(`https://sal.example/api/admin/match-reports/${reportId}/upload`, {
    method: "POST",
    body: form,
  });
}

describe("POST /api/admin/match-reports/[id]/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The handler resets status to "pending" on success, so a terminal report
  // must be rejected before any storage write or status update happens.
  it.each(["cancelled", "done"])("refuses to revive a %s report", async (status) => {
    const { client, update, upload } = supabaseWithReportStatus(status);
    vi.mocked(getSupabaseServerClient).mockReturnValue(
      client as unknown as ReturnType<typeof getSupabaseServerClient>,
    );

    const response = await POST(uploadRequest(), ctx);

    expect(response.status).toBe(409);
    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("still accepts screenshots for a report awaiting review", async () => {
    const { client, update, upload } = supabaseWithReportStatus("pending");
    vi.mocked(getSupabaseServerClient).mockReturnValue(
      client as unknown as ReturnType<typeof getSupabaseServerClient>,
    );

    const response = await POST(uploadRequest(), ctx);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" }),
    );
  });
});
