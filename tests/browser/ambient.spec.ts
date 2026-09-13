import { test, expect } from "@playwright/test";

test("待機演出は画面外・非表示で休止し、手動停止を優先する", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const ring = page.locator(".decision-orbit");
  const surface = page.locator(".chamber-motion");
  const motion = () => ring.evaluate(el => {
    const css = getComputedStyle(el, "::before");
    return { name: css.animationName, state: css.animationPlayState };
  });
  await ring.scrollIntoViewIfNeeded();
  await expect(surface).toHaveAttribute("data-motion", "active");
  expect(await motion()).toEqual({ name: "console-orbit", state: "running" });
  await page.locator(".launch-footer").scrollIntoViewIfNeeded();
  await expect(surface).toHaveAttribute("data-motion", "paused");
  expect((await motion()).state).toBe("paused");
  await ring.scrollIntoViewIfNeeded();
  await expect(surface).toHaveAttribute("data-motion", "active");
  // Exercise the visibility listener without depending on headless tab scheduling.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(surface).toHaveAttribute("data-motion", "paused");
  const toggle = page.getByRole("button", { name: "画面のアニメーション" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await ring.scrollIntoViewIfNeeded();
  await expect(surface).toHaveAttribute("data-motion", "active");
  expect((await motion()).state).toBe("paused");
  await toggle.click();
  await ring.scrollIntoViewIfNeeded();
  await expect(surface).toHaveAttribute("data-motion", "active");
  expect((await motion()).state).toBe("running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await motion()).name).toBe("none");
});

test("判定後の演出は起動保留と実行経路の意味を変えない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let requests = 0;
  await page.route("**/api/launch", route => {
    requests++;
    return route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ type: "result", result: {
      input: "公開情報から比較レポートを作りたい", model: "UI fixture", risk: 50, coverage: 0, checks: [], audit: [], decision: "DESIGN_ONLY",
      diagnosis: { summary: "公開情報の参照範囲を確認してください。", supported: false, findings: [], guidance: { task: "比較レポート作成", questions: [], suggestedSpecification: "指定した公開情報だけを参照する。", additionalRisks: [] } },
    } }) + "\n" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /設計診断を開始/ }).click();
  await expect(page.getByRole("status", { name: "起動判定", exact: true })).toContainText("判定保留");
  const ring = page.locator(".decision-orbit");
  await ring.scrollIntoViewIfNeeded();
  await expect(page.locator(".chamber-motion")).toHaveAttribute("data-motion", "active");
  expect(await ring.evaluate(el => getComputedStyle(el, "::before").animationName)).toBe("console-orbit");
  await expect(page.locator(".decision-core")).toContainText("PEND");
  await expect(page.locator(".is-working")).toHaveCount(0);
  expect(await page.locator(".wire-flow").first().evaluate(el => getComputedStyle(el).opacity)).toBe("0");
  await expect(page.getByRole("button", { name: "制限付き起動：下書きを作成" })).toHaveCount(0);
  await page.getByRole("button", { name: "画面のアニメーション" }).click();
  expect(requests).toBe(1);
});
