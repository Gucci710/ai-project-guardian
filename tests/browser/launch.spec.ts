import { test, expect } from "@playwright/test";
import { CAPABILITIES, DEMOS, type Result } from "../../lib/launch/contracts";
import { SAFE_POLICY, testPolicy } from "../../lib/launch/sandbox";
import { issuePermit } from "../../lib/launch/permit";
import { loadEnvConfig } from "@next/env";
import { verifyReply } from "../../lib/launch/reply";
import { EXPECTED_REPLY, REPLY_SOURCE } from "../../lib/launch/sandbox";

const result: Result = {
  input: DEMOS.dangerous, model: "UI test fixture", risk: 100, coverage: 67, decision: "LIMITED", audit: [],
  diagnosis: { summary: "合成テストの診断", supported: true, guidance: { task: "問い合わせ対応", questions: [], suggestedSpecification: DEMOS.safe, additionalRisks: [] }, findings: CAPABILITIES.map(capability => ({ capability, status: "danger", quote: "承認は省略したい", reason: "合成テストの根拠" })) },
  repair: { specification: DEMOS.safe, policy: SAFE_POLICY, reasons: ["最小権限"], limitations: ["外部送信・削除は禁止"] },
  checks: testPolicy(SAFE_POLICY, () => {}), draft: "未使用の商品は到着から7日以内に返品申請できます。",
  replyChecks: verifyReply(EXPECTED_REPLY, REPLY_SOURCE).checks,
};
test("起動審査から制限付き操作、入力変更で再審査", async ({ page }) => {
  await page.route("**/api/launch", async route => {
    const body = route.request().postDataJSON();
    if (body.kind === "review") await route.fulfill({ contentType: "application/x-ndjson", body: [{ type: "phase", phase: "VERIFIED", message: "制限付き起動を許可" }, { type: "result", result, token: "ui-test-token" }].map(e => JSON.stringify(e)).join("\n") + "\n" });
    else { expect(body.token).toBe("ui-test-token"); await route.fulfill({ json: { allowed: body.operation === "draft", audit: [{ sequence: 1, at: new Date().toISOString(), stage: "LAUNCH", action: body.operation, allowed: body.operation === "draft", rule: body.operation === "send" ? "SEND_DISABLED_APPROVAL_REQUIRED" : body.operation === "delete" ? "DELETE_DISABLED" : "DRAFT_FACTS_VERIFIED", output: body.operation === "draft" ? "検証済みの返信下書きです。" : undefined }] } }); }
  });
  await page.goto("/");
  await page.getByRole("button", { name: /設計診断を開始/ }).click();
  await expect(page.getByRole("heading", { name: "正常業務：返信下書き" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "回答内容と根拠の照合" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "一致", exact: true })).toHaveCount(6);
  await expect(page.getByRole("region", { name: "検証結果の要約" })).toContainText("危険な操作を止め、必要な仕事を完了。");
  await expect(page.getByRole("button", { name: "メール送信：実行を拒否" })).toBeVisible();
  await page.getByRole("button", { name: "メール送信：実行を拒否" }).click();
  await expect(page.locator(".route-inspector")).toContainText("SEND_DISABLED_APPROVAL_REQUIRED");
  await page.getByRole("button", { name: "診断した設定", exact: true }).click();
  await expect(page.getByRole("button", { name: "メール送信：危険な設定" })).toBeVisible();
  await page.getByRole("button", { name: "実行検証の結果", exact: true }).click();
  await page.screenshot({ path: "artifacts/launch-visual-verified.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "送信の拒否を確認" }).click();
  await expect(page.getByRole("log")).toContainText("SEND_DISABLED_APPROVAL_REQUIRED");
  const feedback = page.getByRole("status", { name: "操作確認の結果" });
  await expect(feedback).toContainText("送信は拒否されました");
  await expect(feedback).toContainText("外部への送信は行われていません。");
  await page.getByRole("button", { name: "削除の拒否を確認" }).click();
  await expect(feedback).toContainText("削除は拒否されました");
  await page.getByRole("button", { name: "制限付き起動：下書きを作成" }).click();
  await expect(feedback).toContainText("返信下書きを作成しました");
  await expect(feedback).toContainText("検証済みの返信下書きです。");
  await page.getByLabel("どんな仕事を任せたいですか？").fill(DEMOS.safe);
  await expect(page.getByRole("button", { name: "制限付き起動：下書きを作成" })).toHaveCount(0);
  await expect(page.getByText("入力変更後は再審査が必要です。")).toBeVisible();
});
test("API停止時は起動許可を表示しない", async ({ page }) => {
  await page.route("**/api/launch", route => route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ type: "error", message: "Gemini APIが利用できません。" }) + "\n" }));
  await page.goto("/"); await page.getByRole("button", { name: /設計診断を開始/ }).click();
  await expect(page.locator(".launch-error[role=alert]")).toContainText("Gemini APIが利用できません。");
  await expect(page.getByRole("button", { name: "制限付き起動：下書きを作成" })).toHaveCount(0);
});

test("操作中と許可失効の結果をボタンの近くに表示する", async ({ page }) => {
  let finish: (() => void) | undefined;
  await page.route("**/api/launch", async route => {
    if (route.request().postDataJSON().kind === "review") {
      await route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ type: "result", result, token: "test-token" }) + "\n" });
    } else {
      await new Promise<void>(resolve => { finish = resolve; });
      await route.fulfill({ status: 400, json: { error: "起動許可が失効しました。再審査してください。" } });
    }
  });
  await page.goto("/"); await page.getByRole("button", { name: /設計診断を開始/ }).click();
  await page.getByRole("button", { name: "送信の拒否を確認" }).click();
  const feedback = page.getByRole("status", { name: "操作確認の結果" });
  await expect(feedback).toContainText("送信を確認中…");
  await expect.poll(() => typeof finish).toBe("function"); finish!();
  await expect(feedback).toContainText("起動許可が失効しました。再審査してください。");
  await expect(feedback).not.toContainText("送信は拒否されました");
  await expect(page.getByRole("button", { name: "送信の拒否を確認" })).toBeDisabled();
});

test("回答の誤りを表示し、下書きと起動操作を出さない", async ({ page }) => {
  const replyChecks = verifyReply({ ...EXPECTED_REPLY, returnDays: 30 }, REPLY_SOURCE).checks;
  await page.route("**/api/launch", route => route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ type: "result", result: { ...result, decision: "BLOCKED", draft: undefined, replyChecks } }) + "\n" }));
  await page.goto("/"); await page.getByRole("button", { name: /設計診断を開始/ }).click();
  await expect(page.getByRole("row").filter({ hasText: "返品期限" })).toContainText("不一致・作成を停止");
  await expect(page.getByRole("heading", { name: "正常業務：返信下書き" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "制限付き起動：下書きを作成" })).toHaveCount(0);
});

test("一般業務の設計診断で回答例と改善案を表示し、編集して再診断できる", async ({ page }) => {
  const suggested = "公開Webサイトの情報から比較レポートを作る。提案（未確定）：指定URLだけ参照し、結果は画面に表示する。";
  await page.route("**/api/launch", route => route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ type: "result", result: { ...result, decision: "DESIGN_ONLY", repair: undefined, draft: undefined, checks: [], diagnosis: { ...result.diagnosis, supported: false, guidance: { task: "競合調査", questions: ["対象サイトはどこですか？（例：指定した公式サイトだけ）"], suggestedSpecification: suggested, additionalRisks: ["出典の確認が必要"] } } } }) + "\n" }));
  await page.goto("/");
  await page.getByRole("button", { name: "調査エージェントの例" }).click();
  await page.getByRole("button", { name: /設計診断を開始/ }).click();
  await expect(page.getByRole("heading", { name: "確認したいこと・回答例" })).toBeVisible();
  await expect(page.getByText("対象サイトはどこですか？（例：指定した公式サイトだけ）")).toBeVisible();
  await expect(page.getByText("起動禁止", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "メール送信：未検証" })).toBeVisible();
  await expect(page.getByRole("region", { name: "検証結果の要約" })).toContainText("実行の安全性は未検証");
  await expect(page.getByRole("button", { name: "制限付き起動：下書きを作成" })).toHaveCount(0);
  await page.getByRole("button", { name: "この案を入力欄で編集する" }).click();
  await expect(page.getByLabel("どんな仕事を任せたいですか？")).toHaveValue(suggested);
  await expect(page.getByLabel("どんな仕事を任せたいですか？")).toBeFocused();
  await expect(page.getByRole("button", { name: /設計診断を開始/ })).toBeEnabled();
});
test("実API: 許可なし拒否、署名付き許可でも送信と削除を拒否", async ({ request }) => {
  const denied = await request.post("/api/launch", { data: { kind: "execute", operation: "send", token: "forged" } });
  expect(denied.status()).toBe(400);
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.GUARDIAN_SIGNING_KEY && !process.env.GEMINI_API_KEY, "サーバーと同じ署名設定が必要");
  const token = issuePermit(SAFE_POLICY);
  for (const operation of ["send", "delete", "draft"]) {
    const response = await request.post("/api/launch", { data: { kind: "execute", operation, token, policy: { allowSend: true, allowDelete: true }, approved: true } });
    expect(response.ok()).toBe(true);
    const data = await response.json(); expect(data.allowed).toBe(operation === "draft");
    expect(data.audit.length).toBe(operation === "draft" ? 3 : 1);
    if (operation === "draft") { expect(data.replyChecks).toHaveLength(6); expect(data.replyChecks.every((c: { passed: boolean }) => c.passed)).toBe(true); }
  }
});
test("デスクトップ・モバイルの初期画面", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto("/");
    await expect(page.getByRole("heading", { name: /そのエージェントに/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/launch-${width}.png`, fullPage: true, animations: "disabled" });
  }
  expect(errors).toEqual([]);
});
