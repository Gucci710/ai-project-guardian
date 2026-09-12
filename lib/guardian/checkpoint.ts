import { createHmac, timingSafeEqual } from "node:crypto";
import { type Snapshot, ValidationError } from "./contracts";

export type Checkpoint = { version: 1; expires: number; purpose: "security" | "change" | "verified"; snapshot: Snapshot };
function signature(payload: string): Buffer {
  const key = process.env.GUARDIAN_SIGNING_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("チェックポイント署名用のサーバー設定がありません。");
  return createHmac("sha256", key).update(`guardian-checkpoint-v1:${payload}`).digest();
}
export function signCheckpoint(snapshot: Snapshot, purpose: Checkpoint["purpose"]): string {
  const state: Checkpoint = { version: 1, expires: Date.now() + 60 * 60 * 1000, purpose, snapshot };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function readCheckpoint(token: unknown): Checkpoint {
  if (typeof token !== "string" || token.length > 900000) throw new ValidationError("再開情報が不正です。");
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra) throw new ValidationError("再開情報が不正です。");
  const expected = signature(payload);
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ValidationError("再開情報が変更されています。最初から実行してください。");
  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Checkpoint;
  if (state.version !== 1 || state.expires < Date.now()) throw new ValidationError("再開情報の有効期限が切れました。最初から実行してください。");
  return state;
}
