import { createHmac, timingSafeEqual } from "node:crypto";
import { ValidationError, validate } from "./validation";
import { policySchema, type Policy } from "./contracts";
import { policyProblems } from "./sandbox";

function mac(payload: string) {
  const key = process.env.GUARDIAN_SIGNING_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("署名用のサーバー設定がありません。");
  return createHmac("sha256", key).update(`launch-permit-v1:${payload}`).digest();
}
export function issuePermit(policy: Policy): string {
  validate(policy, policySchema);
  if (policyProblems(policy).length) throw new ValidationError("危険な権限には起動許可を発行できません。");
  const payload = Buffer.from(JSON.stringify({ version: 1, expires: Date.now() + 600000, policy })).toString("base64url");
  return `${payload}.${mac(payload).toString("base64url")}`;
}
export function readPermit(token: unknown): Policy {
  if (typeof token !== "string" || token.length > 8000) throw new ValidationError("有効な起動許可が必要です。");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new ValidationError("起動許可が不正です。");
  const actual = Buffer.from(signature, "base64url"), expected = mac(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ValidationError("権限が変更されています。再審査が必要です。");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (data.version !== 1 || !Number.isFinite(data.expires) || data.expires <= Date.now()) throw new ValidationError("起動許可が失効しました。再審査してください。");
  const policy = validate<Policy>(data.policy, policySchema);
  if (policyProblems(policy).length) throw new ValidationError("許可されない権限です。");
  return policy;
}
