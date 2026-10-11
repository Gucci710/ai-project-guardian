import test from "node:test";
import assert from "node:assert/strict";
import { MemoryReviewLimitStore, ReviewRateLimiter, reviewLimitConfig, reviewLimitResponse } from "../lib/launch/rate-limit";

const config = { shortWindowMs: 10 * 60 * 1000, shortWindowLimit: 2, dailyLimit: 4, collection: "test_limits" };

test("同じ利用者の短時間連続診断を429で制限する", async () => {
  const limiter = new ReviewRateLimiter(new MemoryReviewLimitStore(), config);
  assert.equal((await limiter.consume("client-a", 0)).allowed, true);
  assert.equal((await limiter.consume("client-a", 1)).allowed, true);
  const denied = await limiter.consume("client-a", 2);
  assert.equal(denied.allowed, false);
  assert.equal(denied.scope, "short");
  const response = reviewLimitResponse(denied);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "600");
});

test("共有ストアによりプロセスが変わっても全体24時間上限を維持する", async () => {
  const store = new MemoryReviewLimitStore();
  const firstInstance = new ReviewRateLimiter(store, config);
  const secondInstance = new ReviewRateLimiter(store, config);
  assert.equal((await firstInstance.consume("client-a", 0)).allowed, true);
  assert.equal((await firstInstance.consume("client-b", 1)).allowed, true);
  assert.equal((await secondInstance.consume("client-c", 2)).allowed, true);
  assert.equal((await secondInstance.consume("client-d", 3)).allowed, true);
  const denied = await firstInstance.consume("client-e", 4);
  assert.equal(denied.allowed, false);
  assert.equal(denied.scope, "daily");
});

test("短時間枠と24時間枠は期限後に再開する", async () => {
  const limiter = new ReviewRateLimiter(new MemoryReviewLimitStore(), { ...config, dailyLimit: 2 });
  assert.equal((await limiter.consume("client-a", 0)).allowed, true);
  assert.equal((await limiter.consume("client-a", 1)).allowed, true);
  assert.equal((await limiter.consume("client-a", config.shortWindowMs + 1)).allowed, false);
  assert.equal((await limiter.consume("client-a", 24 * 60 * 60 * 1000 + 1)).allowed, true);
});

test("環境設定を保守的な既定値と範囲で検証する", () => {
  assert.deepEqual(reviewLimitConfig({}), { shortWindowMs: 600000, shortWindowLimit: 2, dailyLimit: 3, collection: "guardian_review_limits_v1" });
  assert.throws(() => reviewLimitConfig({ GUARDIAN_REVIEW_DAILY_LIMIT: "0" }), /設定が不正/);
  assert.throws(() => reviewLimitConfig({ GUARDIAN_RATE_LIMIT_COLLECTION: "bad/path" }), /設定が不正/);
});
