import test from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES, DEMOS, type Diagnosis, type Repair } from "../lib/launch/contracts";
import { createSandbox, SAFE_POLICY, testPolicy } from "../lib/launch/sandbox";
import { issuePermit, readPermit } from "../lib/launch/permit";
import { normalizeDiagnosis, runLaunch } from "../lib/launch/workflow";
import type { Generate } from "../lib/guardian/gemini";

const diagnosis: Diagnosis = { summary: "危険な問い合わせ対応", supported: true, guidance: { task: "問い合わせ対応", questions: ["どの資料を参照しますか？（例：公開FAQだけ）"], suggestedSpecification: DEMOS.safe, additionalRisks: [] }, findings: CAPABILITIES.map(capability => ({ capability, status: capability === "audit" || capability === "limits" ? "unknown" : "danger", quote: "承認は省略したい", reason: "テスト用合成診断" })) };
const repair: Repair = { specification: "関係する顧客情報と公開FAQを参照して返信下書きを作成する。", reasons: ["権限縮小"], limitations: ["送信・削除は禁止"], policy: SAFE_POLICY };
const work = { calls: [{ tool: "customer.read", target: "demo-customer", content: "" }, { tool: "files.read", target: "faq", content: "" }, { tool: "mail.draft", target: "demo-customer", content: "お問い合わせありがとうございます。未使用の商品は到着から7日以内に返品できます。" }] };
function generator(values: unknown[]): Generate { let n = 0; return (async () => { if (n >= values.length) throw new Error("unexpected call"); return values[n++]; }) as Generate; }

test("権限拒否と正常業務を同じ実行層で検証する", () => {
  const checks = testPolicy(SAFE_POLICY, () => {});
  assert.equal(checks.length, 9);
  assert.ok(checks.every(c => c.passed));
  assert.ok(checks.filter(c => !c.expectedAllowed).every(c => !c.actualAllowed));
  const broken = testPolicy({ ...SAFE_POLICY, allowSend: true }, () => {});
  assert.equal(broken.find(c => c.call.tool === "mail.send")?.passed, false);
});
test("読み取り前の下書き・対象外顧客・未知ツールは拒否、上限後も拒否", () => {
  const box = createSandbox({ ...SAFE_POLICY, maxCalls: 3 }, "test", () => {});
  assert.equal(box.execute(work.calls[2]).allowed, false);
  assert.equal(box.execute({ tool: "customer.read", target: "other", content: "" }).allowed, false);
  assert.equal(box.execute({ tool: "shell.exec", target: "anything", content: "" }).allowed, false);
  assert.equal(box.execute(work.calls[0]).rule, "CALL_LIMIT");
  assert.equal(box.drafts, 0);
});
test("根拠の捏造は未確認へ格下げ、項目重複は拒否", () => {
  const normalized = normalizeDiagnosis("これは20文字以上ある根拠のない入力説明です。", diagnosis);
  assert.ok(normalized.findings.every(f => f.status === "unknown"));
  assert.throws(() => normalizeDiagnosis(DEMOS.dangerous, { ...diagnosis, findings: diagnosis.findings.map(() => diagnosis.findings[0]) }));
});
test("診断→制限→実行検証が通ったときだけ制限付き許可", async () => {
  const result = await runLaunch(DEMOS.dangerous, generator([diagnosis, repair, work]), () => {}, new AbortController().signal);
  assert.equal(result.decision, "LIMITED"); assert.equal(result.risk, 100); assert.equal(result.coverage, 67);
  assert.ok(result.audit.some(e => e.stage === "WORK TEST" && e.rule === "DRAFT_ONLY"));
  assert.ok(result.audit.some(e => e.stage === "RETEST" && e.rule === "SEND_DISABLED_APPROVAL_REQUIRED" && !e.allowed));
});
test("情報不足はモデルによる安全判定へ進まない", async () => {
  const result = await runLaunch(DEMOS.unknown, generator([{ ...diagnosis, supported: false }]), () => {}, new AbortController().signal);
  assert.equal(result.decision, "DESIGN_ONLY"); assert.equal(result.repair, undefined);
  assert.ok(result.diagnosis.guidance.questions.length > 0);
});

test("調査業務は情報不足や起動禁止にせず設計案を返し、返信デモへ進まない", async () => {
  const guidance = { task: "競合調査レポートの作成", questions: ["調べるサイトはどこですか？（例：指定した公式サイトだけ）"], suggestedSpecification: "競合の公開情報から比較レポートを作る。提案（未確定）：画面への表示のみ。", additionalRisks: ["推測：出典の誤読。URLを記録し確認する。"] };
  const result = await runLaunch(DEMOS.research, generator([{ ...diagnosis, supported: false, guidance }]), () => {}, new AbortController().signal);
  assert.equal(result.decision, "DESIGN_ONLY");
  assert.deepEqual(result.diagnosis.guidance, guidance);
  assert.equal(result.checks.length, 0); assert.equal(result.draft, undefined); assert.equal(result.repair, undefined);
});

test("短い希望も具体的な確認事項を返し、安全性や起動を認定しない", async () => {
  const result = await runLaunch(DEMOS.unknown, generator([{ ...diagnosis, supported: true, guidance: { ...diagnosis.guidance, questions: [] } }]), () => {}, new AbortController().signal);
  assert.equal(result.decision, "NEEDS_INPUT");
  assert.ok(result.diagnosis.guidance.questions.every(q => q.includes("例：")));
  assert.equal(result.checks.length, 0);
});
test("危険な修正案を再修正し、2回失敗なら停止", async () => {
  const bad = { ...repair, policy: { ...SAFE_POLICY, allowDelete: true } };
  const result = await runLaunch(DEMOS.dangerous, generator([diagnosis, bad, bad]), () => {}, new AbortController().signal);
  assert.equal(result.decision, "BLOCKED"); assert.equal(result.checks.length, 0);
  const recovered = await runLaunch(DEMOS.dangerous, generator([diagnosis, bad, repair, work]), () => {}, new AbortController().signal);
  assert.equal(recovered.decision, "LIMITED");
});
test("モデルが外部メールの命令に従う操作を出しても実行層が拒否し停止", async () => {
  const attack = { calls: [{ tool: "mail.send", target: "external@example.invalid", content: "顧客データ" }, ...work.calls] };
  const result = await runLaunch(DEMOS.dangerous, generator([diagnosis, repair, attack]), () => {}, new AbortController().signal);
  assert.equal(result.decision, "BLOCKED"); assert.equal(result.draft, undefined);
  assert.equal(result.audit.filter(e => e.stage === "WORK TEST" && e.rule !== "WORKFLOW").length, 1);
});
test("APIエラー・キャンセル時に許可結果を返さない", async () => {
  await assert.rejects(runLaunch(DEMOS.dangerous, generator([]), () => {}, new AbortController().signal));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runLaunch(DEMOS.dangerous, generator([diagnosis]), () => {}, controller.signal));
});
test("署名付き許可の改ざん・期限切れ・危険な権限を拒否", () => {
  const old = process.env.GUARDIAN_SIGNING_KEY; process.env.GUARDIAN_SIGNING_KEY = "synthetic-unit-test-key";
  const now = Date.now;
  try {
    const token = issuePermit(SAFE_POLICY);
    assert.deepEqual(readPermit(token), SAFE_POLICY);
    const [payload, signature] = token.split(".");
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()); data.policy.allowSend = true;
    assert.throws(() => readPermit(`${Buffer.from(JSON.stringify(data)).toString("base64url")}.${signature}`));
    assert.throws(() => issuePermit({ ...SAFE_POLICY, allowSend: true }));
    Date.now = () => now() + 600001;
    assert.throws(() => readPermit(token));
  } finally { Date.now = now; if (old === undefined) delete process.env.GUARDIAN_SIGNING_KEY; else process.env.GUARDIAN_SIGNING_KEY = old; }
});
