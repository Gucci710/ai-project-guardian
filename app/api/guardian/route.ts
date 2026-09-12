import { readCheckpoint, signCheckpoint } from "@/lib/guardian/checkpoint";
import { type ProjectInput, type StreamEvent, ValidationError, inputSchema, validate } from "@/lib/guardian/contracts";
import { createGenerator, modelName } from "@/lib/guardian/gemini";
import { errorResponse, readBody } from "@/lib/guardian/http";
import { type WorkflowRequest, runWorkflow } from "@/lib/guardian/workflow";
import { setTimeout as delay } from "node:timers/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    let action: WorkflowRequest;
    if (body.kind === "start") action = { kind: "start", input: validate<ProjectInput>(body.input, inputSchema) };
    else if (body.kind === "resume") {
      if (body.approved !== true) throw new ValidationError("内容を確認してから承認してください。");
      action = { kind: "resume", checkpoint: readCheckpoint(body.token), optionId: typeof body.optionId === "string" ? body.optionId : undefined };
    } else if (body.kind === "change") {
      if (typeof body.changeRequest !== "string" || !body.changeRequest.trim() || body.changeRequest.length > 4000) throw new ValidationError("変更要求を1〜4000文字で入力してください。");
      action = { kind: "change", checkpoint: readCheckpoint(body.token), changeRequest: body.changeRequest.trim() };
    } else throw new ValidationError("実行する操作が不正です。");
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEYを設定してサーバーを再起動してください。");

    const cancel = new AbortController();
    const signal = AbortSignal.any([request.signal, cancel.signal, AbortSignal.timeout(1700000)]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (event: StreamEvent | { type: "heartbeat" }) => {
          if (!closed && !signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);
        try {
          await runWorkflow(action, {
            generate: createGenerator(signal, (agent, message) => send({ type: "log", agent, message, level: "alert" }), action.kind === "start" ? undefined : action.checkpoint.snapshot.model),
            emit: send, checkpoint: signCheckpoint, model: modelName(), signal,
            animate: (ms) => delay(ms, undefined, { signal }),
          });
        } catch (error) {
          if (!request.signal.aborted && !cancel.signal.aborted) {
            const message = signal.aborted ? "実行時間の上限に達しました。仕様を小さくして再実行してください。" : error instanceof Error ? error.message : "検証を完了できませんでした。";
            try { controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message }) + "\n")); } catch { /* client disconnected */ }
          }
        } finally {
          closed = true;
          clearInterval(heartbeat);
          try { controller.close(); } catch { /* client disconnected */ }
        }
      },
      cancel() { cancel.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
