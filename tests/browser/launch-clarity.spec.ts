import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { DEMOS, type Audit, type Result } from "../../lib/launch/contracts";
import { EXPECTED_REPLY, REPLY_SOURCE, SAFE_POLICY, testPolicy } from "../../lib/launch/sandbox";
import { verifyReply } from "../../lib/launch/reply";

const input = "問い合わせメールを読み、問い合わせ本人の顧客情報だけ参照する。資料は公開FAQだけを参照する。返信は承認なしで外部送信してよい。不要なファイルは削除してよい。";
const initialAudit: Audit = { sequence: 1, at: "2026-09-13T01:00:00.000Z", stage: "INPUT", action: input, allowed: true, rule: "SYNTHETIC_SANDBOX_ONLY" };
const latestAudit: Audit = { sequence: 2, at: "2026-09-13T01:01:00.000Z", stage: "LAUNCH", action: "mail.send → clarity-check@example.invalid", allowed: false, rule: "SEND_DISABLED_APPROVAL_REQUIRED" };

const reviewed: Result = {
  input, model: "Browser test fixture", risk: 100, coverage: 67, decision: "LIMITED", audit: [initialAudit],
  diagnosis: {
    summary: "送信と削除の制限が必要です。操作ログと停止条件は未確認です。", supported: true,
    guidance: { task: "問い合わせへの返信", questions: ["操作ログを記録しますか？（例：全操作を記録する）"], suggestedSpecification: DEMOS.safe, additionalRisks: [] },
    findings: [
      { capability: "customer.read", status: "safe", quote: "問い合わせ本人の顧客情報だけ参照する", reason: "参照する個人データが問い合わせ本人に限定されています。" },
      { capability: "files.read", status: "safe", quote: "公開FAQだけを参照する", reason: "資料の参照先が公開FAQに限定されています。" },
      { capability: "mail.send", status: "danger", quote: "承認なしで外部送信してよい", reason: "承認なしの外部送信により情報が漏れるおそれがあります。" },
      { capability: "files.delete", status: "danger", quote: "不要なファイルは削除してよい", reason: "削除対象の範囲と承認が定義されていません。" },
      { capability: "audit", status: "unknown", quote: "", reason: "操作ログの記録が未確認です。" },
      { capability: "limits", status: "unknown", quote: "", reason: "実行上限と停止条件が未確認です。" },
    ],
  },
  repair: { specification: DEMOS.safe, policy: SAFE_POLICY, reasons: ["送信・削除を禁止し、参照先を制限します。"], limitations: ["外部送信と削除はできません。"] },
  checks: testPolicy(SAFE_POLICY, () => {}),
  draft: "未使用の商品は到着から7日以内に返品申請できます。",
  replyChecks: verifyReply(EXPECTED_REPLY, REPLY_SOURCE).checks,
};

function resultFor(decision: Result["decision"]): Result {
  if (decision === "DESIGN_ONLY") return { ...reviewed, decision, diagnosis: { ...reviewed.diagnosis, supported: false }, repair: undefined, checks: [], draft: undefined, replyChecks: undefined };
  if (decision === "BLOCKED") return { ...reviewed, decision, draft: undefined, replyChecks: verifyReply({ ...EXPECTED_REPLY, returnDays: 30 }, REPLY_SOURCE).checks };
  return reviewed;
}

// Deliver a real stream in the browser, leaving it open until the test releases it.
// No Gemini request or timer is needed to inspect the colored cards during diagnosis.
async function startReview(page: Page, result: Result) {
  await page.goto("/");
  await page.getByLabel("どんな仕事を任せたいですか？").fill(input);
  await page.evaluate(({ result, initialAudit, latestAudit }) => {
    const originalFetch = window.fetch.bind(window);
    const control = window as typeof window & { completeGuardianReview?: () => void };
    window.fetch = async (resource, options) => {
      const url = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url;
      if (!url.endsWith("/api/launch")) return originalFetch(resource, options);
      const request = JSON.parse(String(options?.body ?? "{}")) as { kind: string };
      if (request.kind === "execute") return Response.json({ allowed: false, audit: [latestAudit] });
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          send({ type: "audit", entry: initialAudit });
          send({ type: "phase", phase: "DIAGNOSIS", message: "設定の根拠を確認しています。" });
          send({ type: "diagnosis", diagnosis: result.diagnosis });
          control.completeGuardianReview = () => {
            send({ type: "phase", phase: result.decision === "LIMITED" ? "VERIFIED" : result.decision === "BLOCKED" ? "HUMAN REQUIRED" : "DESIGN REVIEW", message: "診断結果を確認してください。" });
            send({ type: "result", result, token: result.decision === "LIMITED" ? "clarity-test-token" : undefined });
            controller.close();
            delete control.completeGuardianReview;
          };
        },
      });
      return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
    };
  }, { result, initialAudit, latestAudit });
  await page.getByRole("button", { name: /設計診断を開始/ }).click();
  await expect(page.locator(".decision-orbit strong")).toHaveText("CHECKING");
  await expect(page.locator(".design-map .route-node.danger")).toHaveCount(1);
  await expect(page.locator(".design-map .route-node.allowed")).toHaveCount(1);
  await expect(page.locator(".design-map .route-node.pending")).toHaveCount(1);
}

async function finishReview(page: Page) {
  await page.evaluate(() => {
    const complete = (window as typeof window & { completeGuardianReview?: () => void }).completeGuardianReview;
    if (!complete) throw new Error("The review stream was not initialized.");
    complete();
  });
  await expect(page.getByRole("button", { name: /設計診断を開始/ })).toBeEnabled();
}

async function expectReadableLayout(page: Page) {
  const core = await page.locator(".design-map .decision-core").boundingBox();
  expect(core).not.toBeNull();
  for (const card of await page.locator(".design-map .route-node").all()) {
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    const overlapX = Math.min(core!.x + core!.width, box!.x + box!.width) - Math.max(core!.x, box!.x);
    const overlapY = Math.min(core!.y + core!.height, box!.y + box!.height) - Math.max(core!.y, box!.y);
    expect(overlapX > 0.5 && overlapY > 0.5, `Central decision overlaps ${await card.locator("strong").textContent()}`).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [1440, 390]) {
  test(`${width}px：診断中とGO・PEND・NO GOで判定とカードを読める`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/launch", route => route.abort());
    for (const [decision, code, filename] of [["LIMITED", "GO", "go"], ["DESIGN_ONLY", "PEND", "pend"], ["BLOCKED", "NO GO", "no-go"]] as const) {
      await startReview(page, resultFor(decision));
      if (decision === "LIMITED") {
        await page.locator(".design-map").screenshot({ path: width === 1440 ? "artifacts/launch-clarity-checking.png" : `artifacts/launch-clarity-checking-${width}.png` });
        await expectReadableLayout(page);
      }
      await finishReview(page);
      await expect(page.locator(".decision-orbit strong")).toHaveText(code);
      await page.locator(".design-map").screenshot({ path: `artifacts/launch-clarity-${filename}-${width}.png`, animations: "disabled" });
      await expectReadableLayout(page);
    }
  });
}

test("数値の意味と原文を確認し、最新操作までレポート・詳細ログに保存できる", async ({ page }) => {
  await page.route("**/api/launch", route => route.abort());
  await startReview(page, reviewed);
  await finishReview(page);
  const metrics = page.getByRole("region", { name: "診断指標の読み方" });
  await expect(metrics).toContainText("事故が起こる確率ではありません");
  await expect(metrics.locator(".metric-card.evidence .metric-value")).toContainText("4/ 6 項目");
  await expect(metrics.locator(".metric-card.evidence .metric-value")).toContainText("67% に原文の根拠あり");
  await expect(metrics).toContainText("危険な設定の記載も数えます");
  await metrics.screenshot({ path: "artifacts/launch-clarity-metrics.png", animations: "disabled" });
  await page.getByRole("region", { name: "診断結果の持ち帰り" }).screenshot({ path: "artifacts/launch-clarity-report.png", animations: "disabled" });
  const evidenceLink = metrics.getByRole("link", { name: "該当する指摘と入力の原文を見る →" });
  await expect(evidenceLink).toHaveAttribute("href", "#diagnosis-evidence");
  await evidenceLink.click();
  await expect(page.locator("#diagnosis-evidence")).toContainText("承認なしで外部送信してよい");
  await page.getByRole("button", { name: "送信の拒否を確認" }).click();
  await expect(page.getByRole("status", { name: "操作確認の結果" })).toContainText("送信は拒否されました");

  const reportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "診断レポートを保存（テキスト）", exact: true }).click();
  const report = await reportDownload;
  expect(report.suggestedFilename()).toMatch(/\.txt$/);
  const reportText = await readFile((await report.path())!, "utf8");
  expect(reportText).toContain("GO：起動可（制限付き）");
  expect(reportText).toContain("入力時点の危険な設定");
  expect(reportText).toContain("承認なしの外部送信により情報が漏れるおそれがあります。");
  expect(reportText).toContain(input);
  expect(reportText).toContain(latestAudit.action);
  expect(reportText).not.toContain("clarity-test-token");

  const logDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "詳細ログを保存（JSON）", exact: true }).click();
  const log = await logDownload;
  expect(log.suggestedFilename()).toMatch(/\.json$/);
  const logText = await readFile((await log.path())!, "utf8");
  const exported = JSON.parse(logText) as { result: Result; audit: Audit[] };
  expect(exported.result.decision).toBe("LIMITED");
  expect(exported.result.input).toBe(input);
  expect(exported.audit.at(-1)).toMatchObject({ stage: "LAUNCH", action: latestAudit.action, rule: latestAudit.rule });
  expect(logText).not.toContain("clarity-test-token");
});
