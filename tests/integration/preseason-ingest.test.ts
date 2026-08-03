/**
 * "Ingest from Preseason" API route tests (#230 part 3).
 *
 * Covers auth gating (superadmin required) and that GET/POST wire request
 * params through to the library functions correctly. The actual ingest
 * logic (preview shape, write ordering, idempotency) is covered by
 * src/lib/preseason-ingest.test.ts — this file only exercises the route.
 */

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let isSuperAdmin = true;

vi.mock("@/lib/admin-auth", () => ({
  isSuperAdminRequest: () => isSuperAdmin,
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/error-monitor", () => ({
  errorMessage: (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback),
}));

vi.mock("@/lib/preseason-ingest", () => ({
  getPreseasonIngestPreview: vi.fn(),
  ingestSeasonFromPreseason: vi.fn(),
}));

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/admin/seasons/[id]/ingest-preseason", () => {
  it("rejects non-superadmin requests", async () => {
    isSuperAdmin = false;
    const { GET } = await import("@/app/api/admin/seasons/[id]/ingest-preseason/route");
    const req = new NextRequest("http://localhost/api/admin/seasons/season-2/ingest-preseason?source=preseason-2");
    const res = await GET(req, params("season-2"));
    expect(res.status).toBe(403);
    isSuperAdmin = true;
  });

  it("returns 400 when the source query param is missing", async () => {
    const { GET } = await import("@/app/api/admin/seasons/[id]/ingest-preseason/route");
    const req = new NextRequest("http://localhost/api/admin/seasons/season-2/ingest-preseason");
    const res = await GET(req, params("season-2"));
    expect(res.status).toBe(400);
  });

  it("returns the preview from getPreseasonIngestPreview on success", async () => {
    const { getPreseasonIngestPreview } = await import("@/lib/preseason-ingest");
    vi.mocked(getPreseasonIngestPreview).mockResolvedValueOnce({
      sourceSeasonId: "preseason-2",
      sourceSeasonName: "Preseason 2",
      targetSeasonId: "season-2",
      targetSeasonName: "Season 2",
      orgCount: 1,
      captainCount: 1,
      freeAgentCount: 2,
      totalPlayers: 3,
      divisions: [],
    });
    const { GET } = await import("@/app/api/admin/seasons/[id]/ingest-preseason/route");
    const req = new NextRequest("http://localhost/api/admin/seasons/season-2/ingest-preseason?source=preseason-2");
    const res = await GET(req, params("season-2"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.orgCount).toBe(1);
    expect(getPreseasonIngestPreview).toHaveBeenCalledWith("preseason-2", "season-2");
  });

  it("surfaces a thrown error (e.g. source === target) as a 500 with its message", async () => {
    const { getPreseasonIngestPreview } = await import("@/lib/preseason-ingest");
    vi.mocked(getPreseasonIngestPreview).mockRejectedValueOnce(new Error("Source and target season must differ."));
    const { GET } = await import("@/app/api/admin/seasons/[id]/ingest-preseason/route");
    const req = new NextRequest("http://localhost/api/admin/seasons/season-2/ingest-preseason?source=season-2");
    const res = await GET(req, params("season-2"));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/must differ/i);
  });
});

describe("POST /api/admin/seasons/[id]/ingest-preseason", () => {
  it("rejects non-superadmin requests", async () => {
    isSuperAdmin = false;
    const { POST } = await import("@/app/api/admin/seasons/[id]/ingest-preseason/route");
    const req = new NextRequest("http://localhost/api/admin/seasons/season-2/ingest-preseason", {
      method: "POST",
      body: JSON.stringify({ source: "preseason-2" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, params("season-2"));
    expect(res.status).toBe(403);
    isSuperAdmin = true;
  });

  it("returns 400 for a missing/invalid body", async () => {
    const { POST } = await import("@/app/api/admin/seasons/[id]/ingest-preseason/route");
    const req = new NextRequest("http://localhost/api/admin/seasons/season-2/ingest-preseason", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, params("season-2"));
    expect(res.status).toBe(400);
  });

  it("applies the ingest and revalidates league-data on success", async () => {
    const { ingestSeasonFromPreseason } = await import("@/lib/preseason-ingest");
    vi.mocked(ingestSeasonFromPreseason).mockResolvedValueOnce({ orgsIngested: 1, playersIngested: 3 });
    const { revalidateTag } = await import("next/cache");
    const { POST } = await import("@/app/api/admin/seasons/[id]/ingest-preseason/route");

    const req = new NextRequest("http://localhost/api/admin/seasons/season-2/ingest-preseason", {
      method: "POST",
      body: JSON.stringify({ source: "preseason-2" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, params("season-2"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, orgsIngested: 1, playersIngested: 3 });
    expect(ingestSeasonFromPreseason).toHaveBeenCalledWith("preseason-2", "season-2");
    expect(revalidateTag).toHaveBeenCalledWith("league-data", {});
  });
});
