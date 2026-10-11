import test from "node:test";
import assert from "node:assert/strict";
import type { GenerateContentParameters } from "@google/genai";
import { POST } from "../app/api/launch/route";
import { createGenerator, type Generate } from "../lib/launch/gemini";
import { issuePermit } from "../lib/launch/permit";
import { SAFE_POLICY } from "../lib/launch/sandbox";

async function withSyntheticConfiguration(run: () => Promise<void>) {
  const configuration = {
    GEMINI_API_KEY: "synthetic-runtime-test-key",
    GEMINI_FALLBACK_MODELS: "backup",
    GUARDIAN_SIGNING_KEY: "synthetic-runtime-signing-key",
  };
  const previous = Object.fromEntries(Object.keys(configuration).map(key => [key, process.env[key]]));
  Object.assign(process.env, configuration);
  try { await run(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const success = { text: JSON.stringify({ value: "合成の応答" }) };
const ask = (generate: Generate) => generate<{ value: string }>("DIAGNOSIS", "合成テスト", {}, {
  type: "object", properties: { value: { type: "string" } }, required: ["value"],
});

function harness(
  respond: (parameters: GenerateContentParameters, requestNumber: number) => Promise<{ text?: string }>,
  signal = new AbortController().signal,
) {
  const models: string[] = [], notifications: string[] = [], pauses: number[] = [], requests: GenerateContentParameters[] = [];
  const generate = createGenerator(signal, (_agent, message) => notifications.push(message), "primary", {
    request: async parameters => {
      requests.push(parameters);
      models.push(parameters.model);
      return respond(parameters, models.length);
    },
    pause: async ms => { pauses.push(ms); },
  });
  return { generate, models, notifications, pauses, requests };
}

test("Gemini 3.8で廃止されたtemperatureを送信しない", async () => withSyntheticConfiguration(async () => {
  const observed = harness(async () => success);
  await ask(observed.generate);
  assert.equal("temperature" in (observed.requests[0].config ?? {}), false);
}));

test("SDK単発タイムアウトから同じモデルの再試行で復帰する", async () => withSyntheticConfiguration(async () => {
  const observed = harness(async (_parameters, count) => {
    if (count === 1) throw new DOMException("Synthetic SDK timeout", "AbortError");
    return success;
  });
  assert.equal((await ask(observed.generate)).value, "合成の応答");
  assert.deepEqual(observed.models, ["primary", "primary"]);
  assert.equal(observed.pauses.length, 1);
  assert.match(observed.notifications[0], /タイムアウト/);
  assert.ok(observed.notifications.every(message => !message.includes("NaN")));
}));

test("SDKタイムアウトが続いたら代替モデルで復帰する", async () => withSyntheticConfiguration(async () => {
  const observed = harness(async parameters => {
    if (parameters.model === "primary") throw new DOMException("Synthetic SDK timeout", "AbortError");
    return success;
  });
  assert.equal((await ask(observed.generate)).value, "合成の応答");
  assert.deepEqual(observed.models, ["primary", "primary", "backup"]);
  assert.equal(observed.pauses.length, 1);
  assert.equal(observed.generate.getModel?.(), "backup");
  assert.ok(observed.notifications.some(message => message.includes("backupへ切り替え")));
}));

test("全モデルが単発タイムアウトしても有限回で停止する", async () => withSyntheticConfiguration(async () => {
  for (const name of ["AbortError", "TimeoutError"]) {
    const observed = harness(async () => { throw new DOMException("Synthetic SDK timeout", name); });
    await assert.rejects(ask(observed.generate), /応答を取得できませんでした/);
    assert.deepEqual(observed.models, ["primary", "primary", "backup", "backup"]);
    assert.equal(observed.pauses.length, 2);
  }
}));

test("利用者キャンセルと審査全体の期限切れでは再試行・切替しない", async () => withSyntheticConfiguration(async () => {
  for (const name of ["AbortError", "TimeoutError"]) {
    for (const timing of ["before", "during", "response"] as const) {
      const controller = new AbortController();
      const reason = new DOMException("Synthetic overall stop", name);
      if (timing === "before") controller.abort(reason);
      const observed = harness(async () => {
        controller.abort(reason);
        if (timing === "response") return success;
        throw reason;
      }, controller.signal);
      await assert.rejects(ask(observed.generate), error => error === reason);
      assert.deepEqual(observed.models, timing === "before" ? [] : ["primary"]);
      assert.deepEqual(observed.pauses, []);
      assert.deepEqual(observed.notifications, []);
    }
  }
}));

test("HTTP 429は待機せず即切替し、以降も代替モデルを利用する", async () => withSyntheticConfiguration(async () => {
  const observed = harness(async parameters => {
    if (parameters.model === "primary") throw Object.assign(new Error("Synthetic quota"), { status: 429 });
    return success;
  });
  await ask(observed.generate);
  await ask(observed.generate);
  assert.deepEqual(observed.models, ["primary", "backup", "backup"]);
  assert.deepEqual(observed.pauses, []);
  assert.equal(observed.notifications.length, 1);
  assert.equal(observed.generate.getModel?.(), "backup");
}));

function executeRequest(token: string, operation: unknown) {
  return new Request("http://guardian.test/api/launch", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "execute", token, operation }),
  });
}

test("実行APIは文字列以外の操作を400で拒否し、別操作へ変換しない", async () => withSyntheticConfiguration(async () => {
  const token = issuePermit(SAFE_POLICY);
  for (const operation of [["draft"], ["send"], ["delete"], null, {}, 0, false, undefined, "other"]) {
    const response = await POST(executeRequest(token, operation));
    assert.equal(response.status, 400, JSON.stringify(operation));
    const body = await response.json();
    assert.equal(body.success, false);
    assert.match(body.error, /操作が不正/);
    assert.equal(body.audit, undefined);
    assert.equal(body.allowed, undefined);
  }
}));

test("実行APIは正しい操作名で下書き許可・送信拒否・削除拒否を維持する", async () => withSyntheticConfiguration(async () => {
  const token = issuePermit(SAFE_POLICY);
  for (const [operation, allowed, rule] of [
    ["draft", true, "DRAFT_FACTS_VERIFIED"],
    ["send", false, "SEND_DISABLED_APPROVAL_REQUIRED"],
    ["delete", false, "DELETE_DISABLED"],
  ] as const) {
    const response = await POST(executeRequest(token, operation));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.allowed, allowed);
    assert.equal(body.audit.at(-1).rule, rule);
    assert.equal(body.audit.length, operation === "draft" ? 3 : 1);
  }
}));
