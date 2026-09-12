import { ValidationError } from "./contracts";

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  // Cloud Run terminates TLS before forwarding to the Node server.
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || new URL(request.url).host;
  if (origin) {
    let originHost: string;
    try { originHost = new URL(origin).host; } catch { throw new ValidationError("送信元が不正です。"); }
    if (originHost !== host) throw new ValidationError("同じサイトから実行してください。");
  }
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ValidationError("JSON形式で送信してください。");
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError("入力がありません。");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1000000) { await reader.cancel(); throw new ValidationError("入力が大きすぎます。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result as Record<string, unknown>;
  } catch { throw new ValidationError("入力JSONが不正です。"); }
}

export function errorResponse(error: unknown): Response {
  return Response.json({ success: false, error: error instanceof Error ? error.message : "処理に失敗しました。" }, { status: error instanceof ValidationError ? 400 : 503, headers: { "Cache-Control": "no-store" } });
}
