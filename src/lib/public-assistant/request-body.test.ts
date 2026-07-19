import { describe, expect, it } from "vitest";
import { readBoundedJson } from "./request-body";

function streamedRequest(text: string, headers = new Headers()): Pick<Request, "headers" | "body"> {
  return {
    headers,
    body: new Request("https://sal.example.test/request", { method: "POST", body: text }).body,
  };
}

describe("bounded JSON request reader", () => {
  it("parses a valid body when Content-Length is absent", async () => {
    await expect(readBoundedJson(streamedRequest('{"question":"hello"}'), 64)).resolves.toEqual({
      ok: true,
      value: { question: "hello" },
    });
  });

  it("rejects a declared oversized or invalid Content-Length before reading", async () => {
    await expect(
      readBoundedJson(streamedRequest("{}", new Headers({ "Content-Length": "65" })), 64),
    ).resolves.toEqual({ ok: false, code: "body_too_large" });
    await expect(
      readBoundedJson(streamedRequest("{}", new Headers({ "Content-Length": "chunked" })), 64),
    ).resolves.toEqual({ ok: false, code: "invalid_content_length" });
  });

  it("bounds chunked or lying-length bodies by bytes while streaming", async () => {
    const oversized = JSON.stringify({ question: "x".repeat(80) });
    await expect(readBoundedJson(streamedRequest(oversized), 32)).resolves.toEqual({
      ok: false,
      code: "body_too_large",
    });
    await expect(
      readBoundedJson(streamedRequest(oversized, new Headers({ "Content-Length": "2" })), 32),
    ).resolves.toEqual({ ok: false, code: "body_too_large" });
  });

  it("fails safely for invalid JSON", async () => {
    await expect(readBoundedJson(streamedRequest("not-json"), 64)).resolves.toEqual({
      ok: false,
      code: "invalid_json",
    });
  });
});
