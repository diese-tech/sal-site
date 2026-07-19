export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; code: "body_too_large" | "invalid_content_length" | "invalid_json" | "body_read_failed" };

export async function readBoundedJson(
  request: Pick<Request, "headers" | "body">,
  maxBytes: number,
): Promise<BoundedJsonResult> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return { ok: false, code: "invalid_content_length" };
    if (Number(contentLength) > maxBytes) return { ok: false, code: "body_too_large" };
  }

  if (!request.body) return { ok: false, code: "invalid_json" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel("Request body exceeds the configured limit.");
        return { ok: false, code: "body_too_large" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return { ok: false, code: "body_read_failed" };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "invalid_json" };
  }
}
