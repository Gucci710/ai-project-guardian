import type { Schema } from "./validation";
import type { ReplyCheck } from "./reply";

export const DEMOS = {
  dangerous: "問い合わせメールを読み、顧客情報と資料を調べて自動返信してほしい。必要なファイルには自由にアクセスし、不要なものは削除していい。承認は省略したい。",
  safe: "問い合わせメールを読み、その問い合わせの顧客情報と公開FAQだけを参照して返信下書きを作成する。全件アクセスと削除は禁止。外部送信は人の承認が必要で、この環境では下書きまで。操作ログを記録し、1実行10操作まで、異常時は停止する。",
  unknown: "問い合わせ対応を便利にするAIを作りたい。",
  research: "公開Webサイトから競合製品の情報を調べて、比較レポートを作るエージェントがほしい。",
};
export const CAPABILITIES = ["customer.read", "files.read", "mail.send", "files.delete", "audit", "limits"] as const;
export type Capability = typeof CAPABILITIES[number];
export type Finding = { capability: Capability; status: "danger" | "safe" | "unknown"; quote: string; reason: string };
export type Guidance = { task: string; questions: string[]; suggestedSpecification: string; additionalRisks: string[] };
// supported means compatible with the existing email sandbox, not a valid user request.
export type Diagnosis = { summary: string; supported: boolean; findings: Finding[]; guidance: Guidance };
export type Policy = { customerScope: "related" | "all"; fileScope: "faq" | "all"; allowSend: boolean; allowDelete: boolean; allowDraft: boolean; maxCalls: number };
export type Repair = { specification: string; reasons: string[]; limitations: string[]; policy: Policy };
export type Call = { tool: string; target: string; content: string };
export type Audit = { sequence: number; at: string; stage: string; action: string; allowed: boolean; rule: string; output?: string };
export type Check = { name: string; call: Call; expectedAllowed: boolean; actualAllowed: boolean; passed: boolean; rule: string };
export type Result = { input: string; model: string; diagnosis: Diagnosis; risk: number; coverage: number; repair?: Repair; checks: Check[]; replyChecks?: ReplyCheck[]; draft?: string; decision: "BLOCKED" | "UNVERIFIED" | "LIMITED" | "DESIGN_ONLY" | "NEEDS_INPUT"; audit: Audit[] };
export type Event = { type: "diagnosis"; diagnosis: Diagnosis } | { type: "phase"; phase: string; message: string } | { type: "audit"; entry: Audit } | { type: "result"; result: Result; token?: string } | { type: "error"; message: string } | { type: "heartbeat" };
const str: Schema = { type: "string", maxLength: 4000 };
const object = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties) });
const guidanceSchema = object({ task: { ...str, minLength: 1 }, questions: { type: "array", maxItems: 6, items: { ...str, minLength: 1 } }, suggestedSpecification: { ...str, minLength: 5 }, additionalRisks: { type: "array", maxItems: 10, items: { ...str, minLength: 1 } } });
export const diagnosisSchema = object({ summary: str, supported: { type: "boolean" }, guidance: guidanceSchema, findings: { type: "array", minItems: 6, maxItems: 6, items: object({ capability: { ...str, enum: [...CAPABILITIES] }, status: { ...str, enum: ["danger", "safe", "unknown"] }, quote: str, reason: str }) } });
export const policySchema = object({ customerScope: { ...str, enum: ["related", "all"] }, fileScope: { ...str, enum: ["faq", "all"] }, allowSend: { type: "boolean" }, allowDelete: { type: "boolean" }, allowDraft: { type: "boolean" }, maxCalls: { type: "integer", minimum: 1, maximum: 10 } });
export const repairSchema = object({ specification: { ...str, minLength: 20 }, reasons: { type: "array", minItems: 1, maxItems: 10, items: str }, limitations: { type: "array", minItems: 1, maxItems: 10, items: str }, policy: policySchema });
export const workSchema = object({ calls: { type: "array", minItems: 1, maxItems: 8, items: object({ tool: str, target: str, content: str }) } });
