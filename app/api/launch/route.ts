import { createGenerator } from "@/lib/launch/gemini";
import { errorResponse, readBody } from "@/lib/launch/http";
import { ValidationError } from "@/lib/launch/validation";
import type { Audit, Event } from "@/lib/launch/contracts";
import { issuePermit, readPermit } from "@/lib/launch/permit";
import { createSandbox, EXPECTED_REPLY } from "@/lib/launch/sandbox";
import { runLaunch } from "@/lib/launch/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (body.kind === "execute") {
      const policy = readPermit(body.token);
      // Never accept policy, scope or approval flags from the client.
      if (!["draft", "send", "delete"].includes(String(body.operation))) throw new ValidationError("操作が不正です。");
      const audit: Audit[] = [];
      const box = createSandbox(policy, "LAUNCH", e => audit.push({ ...e, sequence: audit.length + 1, at: new Date().toISOString() }));
      if (body.operation === "draft") {
        box.execute({ tool: "customer.read", target: "demo-customer", content: "" });
        box.execute({ tool: "files.read", target: "faq", content: "" });
        box.execute({ tool: "mail.draft", target: "demo-customer", content: JSON.stringify(EXPECTED_REPLY) });
      } else box.execute({ tool: body.operation === "send" ? "mail.send" : "files.delete", target: body.operation === "send" ? "external@example.invalid" : "faq", content: "合成データでの操作確認" });
      return Response.json({ audit, replyChecks: box.replyChecks, allowed: audit.at(-1)?.allowed }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.kind !== "review" || typeof body.input !== "string" || body.input.trim().length < 5 || body.input.length > 12000) throw new ValidationError("エージェントの説明を5〜12000文字で入力してください。");
    const input = body.input.trim();
    const cancel = new AbortController();
    const signal = AbortSignal.any([request.signal, cancel.signal, AbortSignal.timeout(540000)]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (event: Event) => { if (!closed && !cancel.signal.aborted && !request.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
        const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);
        try {
          const generate = createGenerator(signal, (agent, message) => send({ type: "phase", phase: agent, message }));
          const result = await runLaunch(input, generate, send, signal);
          signal.throwIfAborted();
          send({ type: "result", result, ...(result.decision === "LIMITED" && result.repair ? { token: issuePermit(result.repair.policy) } : {}) });
        } catch (error) { send({ type: "error", message: signal.aborted ? "実行を停止しました。未検証のため起動できません。" : error instanceof Error ? error.message : "検証に失敗しました。" }); }
        finally { closed = true; clearInterval(heartbeat); try { controller.close(); } catch { /* disconnected */ } }
      },
      cancel() { cancel.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
