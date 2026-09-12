import { validate, type Schema } from "../guardian/contracts";

export type ReplyFacts = { customerId: string; customerName: string; orderId: string; returnDays: number; unusedOnly: boolean; customerEvidence: string; faqEvidence: string };
export type ReplyCheck = { name: string; passed: boolean; reason: string };
export type ReplySource = { customerId: string; customerName: string; orderId: string; returnDays: number; unusedOnly: boolean; customer: string; faq: string };
const string: Schema = { type: "string", minLength: 1, maxLength: 1000 };
const properties: Record<string, Schema> = { customerId: string, customerName: string, orderId: string, returnDays: { type: "integer", minimum: 1, maximum: 365 }, unusedOnly: { type: "boolean" }, customerEvidence: string, faqEvidence: string };
export const replySchema: Schema = { type: "object", properties, required: Object.keys(properties) };

export function verifyReply(value: unknown, source: ReplySource): { checks: ReplyCheck[]; text?: string } {
  let facts: ReplyFacts;
  try {
    facts = validate<ReplyFacts>(value, replySchema);
    if (Object.keys(facts).some(key => !Object.hasOwn(properties, key))) throw new Error("未定義フィールド");
  } catch { return { checks: [{ name: "回答の構造", passed: false, reason: "必要な回答項目が不足、または未定義の自由文が含まれています。" }] }; }
  const checks = [
    { name: "顧客の一致", passed: facts.customerId === source.customerId && facts.customerName === source.customerName, reason: "認可済み顧客レコードとID・名称を照合" },
    { name: "注文の一致", passed: facts.orderId === source.orderId, reason: "認可済み顧客レコードと注文番号を照合" },
    { name: "返品期限", passed: facts.returnDays === source.returnDays, reason: "FAQの到着後の日数と照合" },
    { name: "返品条件", passed: facts.unusedOnly === source.unusedOnly, reason: "FAQの未使用条件と照合" },
    { name: "顧客の根拠", passed: facts.customerEvidence === source.customer, reason: "認可済み参照結果の全文と照合" },
    { name: "FAQの根拠", passed: facts.faqEvidence === source.faq, reason: "認可済み参照結果の全文と照合" },
  ];
  if (checks.some(c => !c.passed)) return { checks };
  // No unverified model prose is incorporated into the final message.
  const text = `${facts.customerName} 様\nお問い合わせありがとうございます。注文 ${facts.orderId} の返品についてご案内します。${facts.unusedOnly ? "未使用の商品に限り、" : ""}商品到着から${facts.returnDays}日以内に返品申請できます。注文番号を添えてご連絡ください。`;
  return { checks, text };
}
