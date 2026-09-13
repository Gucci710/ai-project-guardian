import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewReport } from "../lib/launch/report";
import { CAPABILITIES, type Audit, type Result } from "../lib/launch/contracts";

function fixture(decision: Result["decision"] = "DESIGN_ONLY"): Result {
  return {
    input: "公開サイトを調べて競合の比較レポートを画面に表示したい。",
    model: "test-model",
    diagnosis: {
      summary: "参照するサイトの指定と外部送信の扱いを確認してください。",
      supported: false,
      guidance: { task: "競合調査", questions: ["参照するサイトはどこですか？"], suggestedSpecification: "指定した公開サイトのみ参照する（提案・未確定）。", additionalRisks: ["推測：出典の取り違え"] },
      findings: CAPABILITIES.map(capability => ({ capability, status: "unknown", quote: "", reason: "設定が書かれていません。" })),
    },
    decision, risk: 50, coverage: 0, checks: [], audit: [],
  };
}

test("PENDレポートは未検証・確認事項・提案を区別し、存在しない日時を作らない", () => {
  const report = buildReviewReport(fixture(), []);
  assert.match(report, /PEND：判定保留/);
  assert.match(report, /説明の追記だけでは解除できません/);
  assert.match(report, /参照するサイトはどこですか/);
  assert.match(report, /【入力時点の未確認項目】6件/);
  assert.match(report, /【説明の書き直し案：提案・未確定】/);
  assert.match(report, /未実施。操作を止められるか/);
  assert.match(report, /安全度やAIの正答率ではありません/);
  assert.doesNotMatch(report, /記録開始：|記録最終：/);
});

test("GOレポートも元の危険を修正前と明示し、拒否成功と回答の照合を実値で出す", () => {
  const result = fixture("LIMITED");
  result.diagnosis.findings[2] = { capability: "mail.send", status: "danger", quote: "承認なく送信する", reason: "送信前の確認がありません。" };
  result.risk = 100;
  result.coverage = 17;
  result.checks = [{ name: "無承認の外部送信", call: { tool: "mail.send", target: "outside", content: "" }, expectedAllowed: false, actualAllowed: false, passed: true, rule: "SEND_DISABLED_APPROVAL_REQUIRED" }];
  result.replyChecks = [{ name: "顧客の一致", reason: "顧客レコードと照合", passed: true }];
  result.repair = { specification: "関係する顧客と公開FAQで返信下書きを作る。", reasons: ["権限を制限するため"], limitations: ["外部送信禁止"], policy: { customerScope: "related", fileScope: "faq", allowSend: false, allowDelete: false, allowDraft: true, maxCalls: 4 } };
  const report = buildReviewReport(result, []);
  assert.match(report, /GO：起動可（制限付き）/);
  assert.match(report, /修正前の入力への指摘/);
  assert.match(report, /入力の引用：承認なく送信する/);
  assert.match(report, /期待：拒否／実際：拒否/);
  assert.match(report, /一致 1 \/ 1件/);
  assert.match(report, /操作上限：4回/);
  assert.match(report, /実行用の起動許可証ではありません/);
});

test("後から試した拒否操作を、診断時点のauditだけでなく現在の記録から出す", () => {
  const result = fixture("LIMITED");
  result.audit = [{ sequence: 1, at: "2026-09-13T01:00:00Z", stage: "VERIFIED", action: "検証完了", allowed: true, rule: "WORKFLOW" }];
  const latest: Audit[] = [...result.audit, { sequence: 2, at: "2026-09-13T01:01:00Z", stage: "LAUNCH", action: "files.delete → faq", allowed: false, rule: "DELETE_DISABLED" }];
  const report = buildReviewReport(result, latest);
  assert.match(report, /操作 1件：許可 0件、拒否 1件/);
  assert.match(report, /拒否｜files.delete → faq｜適用ルール：DELETE_DISABLED/);
  assert.match(report, /記録最終：2026-09-13T01:01:00Z/);
  assert.match(buildReviewReport(result, []), /記録開始：2026-09-13T01:00:00Z/);
});
