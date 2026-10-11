import { createHmac } from "node:crypto";
import { Firestore, Timestamp, type DocumentData } from "@google-cloud/firestore";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewLimitConfig = {
  shortWindowMs: number;
  shortWindowLimit: number;
  dailyLimit: number;
  collection: string;
};

type Counter = { count: number; windowStartedAtMs: number };
type Allowed = { allowed: true; remainingShort: number; remainingDaily: number };
type Denied = { allowed: false; scope: "short" | "daily"; retryAfterSeconds: number; limit: number };
export type ReviewLimitDecision = Allowed | Denied;

export interface ReviewLimitStore {
  consume(clientKey: string, nowMs: number, config: ReviewLimitConfig): Promise<ReviewLimitDecision>;
}

function integerSetting(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name}の設定が不正です。`);
  return parsed;
}

export function reviewLimitConfig(environment: Record<string, string | undefined> = process.env): ReviewLimitConfig {
  const collection = environment.GUARDIAN_RATE_LIMIT_COLLECTION || "guardian_review_limits_v1";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(collection)) throw new Error("GUARDIAN_RATE_LIMIT_COLLECTIONの設定が不正です。");
  return {
    shortWindowMs: integerSetting(environment.GUARDIAN_REVIEW_WINDOW_SECONDS, 600, 60, 86400, "GUARDIAN_REVIEW_WINDOW_SECONDS") * 1000,
    shortWindowLimit: integerSetting(environment.GUARDIAN_REVIEW_WINDOW_LIMIT, 2, 1, 100, "GUARDIAN_REVIEW_WINDOW_LIMIT"),
    dailyLimit: integerSetting(environment.GUARDIAN_REVIEW_DAILY_LIMIT, 3, 1, 10000, "GUARDIAN_REVIEW_DAILY_LIMIT"),
    collection,
  };
}

function counter(value: DocumentData | Counter | undefined, nowMs: number, durationMs: number): Counter {
  const count = Number(value?.count);
  const started = Number(value?.windowStartedAtMs);
  if (!Number.isInteger(count) || count < 0 || !Number.isFinite(started) || started > nowMs || nowMs - started >= durationMs) {
    return { count: 0, windowStartedAtMs: nowMs };
  }
  return { count, windowStartedAtMs: started };
}

function retryAfter(current: Counter, durationMs: number, nowMs: number) {
  return Math.max(1, Math.ceil((current.windowStartedAtMs + durationMs - nowMs) / 1000));
}

function evaluate(globalValue: DocumentData | Counter | undefined, clientValue: DocumentData | Counter | undefined, nowMs: number, config: ReviewLimitConfig) {
  const daily = counter(globalValue, nowMs, DAY_MS);
  const short = counter(clientValue, nowMs, config.shortWindowMs);
  if (daily.count >= config.dailyLimit) {
    return { decision: { allowed: false, scope: "daily", retryAfterSeconds: retryAfter(daily, DAY_MS, nowMs), limit: config.dailyLimit } satisfies Denied, daily, short };
  }
  if (short.count >= config.shortWindowLimit) {
    return { decision: { allowed: false, scope: "short", retryAfterSeconds: retryAfter(short, config.shortWindowMs, nowMs), limit: config.shortWindowLimit } satisfies Denied, daily, short };
  }
  const nextDaily = { ...daily, count: daily.count + 1 };
  const nextShort = { ...short, count: short.count + 1 };
  return {
    decision: { allowed: true, remainingShort: config.shortWindowLimit - nextShort.count, remainingDaily: config.dailyLimit - nextDaily.count } satisfies Allowed,
    daily: nextDaily,
    short: nextShort,
  };
}

export class MemoryReviewLimitStore implements ReviewLimitStore {
  private readonly counters = new Map<string, Counter>();

  async consume(clientKey: string, nowMs: number, config: ReviewLimitConfig): Promise<ReviewLimitDecision> {
    const globalKey = `${config.collection}:global`;
    const clientStoreKey = `${config.collection}:client:${clientKey}`;
    const result = evaluate(this.counters.get(globalKey), this.counters.get(clientStoreKey), nowMs, config);
    if (result.decision.allowed === true) {
      this.counters.set(globalKey, result.daily);
      this.counters.set(clientStoreKey, result.short);
    }
    return result.decision;
  }
}

export class FirestoreReviewLimitStore implements ReviewLimitStore {
  constructor(private readonly firestore: Firestore) {}

  async consume(clientKey: string, nowMs: number, config: ReviewLimitConfig): Promise<ReviewLimitDecision> {
    const collection = this.firestore.collection(config.collection);
    const dailyRef = collection.doc("global-review-24h");
    const clientRef = collection.doc(`client-${clientKey}`);
    return this.firestore.runTransaction(async transaction => {
      const [dailySnapshot, clientSnapshot] = await transaction.getAll(dailyRef, clientRef);
      const result = evaluate(dailySnapshot.data(), clientSnapshot.data(), nowMs, config);
      if (result.decision.allowed === true) {
        transaction.set(dailyRef, { ...result.daily, expiresAt: Timestamp.fromMillis(result.daily.windowStartedAtMs + DAY_MS * 2) });
        transaction.set(clientRef, { ...result.short, expiresAt: Timestamp.fromMillis(result.short.windowStartedAtMs + config.shortWindowMs * 2) });
      }
      return result.decision;
    });
  }
}

export class ReviewRateLimiter {
  private globalBlockedUntil = 0;
  private readonly clientBlockedUntil = new Map<string, number>();

  constructor(private readonly store: ReviewLimitStore, private readonly config: ReviewLimitConfig) {}

  async consume(clientKey: string, nowMs = Date.now()): Promise<ReviewLimitDecision> {
    if (nowMs < this.globalBlockedUntil) {
      return { allowed: false, scope: "daily", retryAfterSeconds: Math.max(1, Math.ceil((this.globalBlockedUntil - nowMs) / 1000)), limit: this.config.dailyLimit };
    }
    const clientUntil = this.clientBlockedUntil.get(clientKey) ?? 0;
    if (nowMs < clientUntil) {
      return { allowed: false, scope: "short", retryAfterSeconds: Math.max(1, Math.ceil((clientUntil - nowMs) / 1000)), limit: this.config.shortWindowLimit };
    }
    const decision = await this.store.consume(clientKey, nowMs, this.config);
    if (decision.allowed === false) {
      const until = nowMs + decision.retryAfterSeconds * 1000;
      if (decision.scope === "daily") this.globalBlockedUntil = until;
      else this.clientBlockedUntil.set(clientKey, until);
    }
    return decision;
  }
}

let limiter: ReviewRateLimiter | undefined;

function defaultLimiter() {
  const config = reviewLimitConfig();
  const backend = process.env.GUARDIAN_RATE_LIMIT_BACKEND || (process.env.K_SERVICE ? "firestore" : "memory");
  if (!["firestore", "memory"].includes(backend)) throw new Error("GUARDIAN_RATE_LIMIT_BACKENDの設定が不正です。");
  const store = backend === "firestore"
    ? new FirestoreReviewLimitStore(new Firestore({
        ...(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : {}),
        ...(process.env.GUARDIAN_FIRESTORE_DATABASE ? { databaseId: process.env.GUARDIAN_FIRESTORE_DATABASE } : {}),
      }))
    : new MemoryReviewLimitStore();
  return new ReviewRateLimiter(store, config);
}

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown-client";
  const key = process.env.GUARDIAN_RATE_LIMIT_HASH_KEY || process.env.GUARDIAN_SIGNING_KEY || process.env.GEMINI_API_KEY || "local-development-only";
  return createHmac("sha256", key).update(address).digest("hex").slice(0, 32);
}

export async function consumeReviewLimit(request: Request): Promise<ReviewLimitDecision> {
  limiter ??= defaultLimiter();
  try {
    return await limiter.consume(clientKey(request));
  } catch (error) {
    console.error("Review rate limiter unavailable", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : String(error) });
    throw new Error("診断の利用量保護を確認できないため、一時的に診断を停止しています。");
  }
}

export function reviewLimitResponse(decision: Denied) {
  const error = decision.scope === "daily"
    ? "無料枠保護のため、全体の診断上限に達しました。時間をおいてお試しください。"
    : "短時間に診断が繰り返されたため、一時的に受付を停止しています。時間をおいてお試しください。";
  return Response.json({ success: false, error }, {
    status: 429,
    headers: { "Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds), "X-RateLimit-Scope": decision.scope },
  });
}
