export type Autonomy = "AUTONOMOUS" | "SUPERVISED" | "HUMAN_REQUIRED";
export type Phase = "READY" | "PLANNING" | "QA REVIEW" | "PLAN REPAIR" | "RED TEAM" | "BREACH DETECTED" | "BLUE TEAM" | "SELF REPAIR" | "RETEST" | "VERIFIED" | "REPLANNING" | "FINAL VERIFIED" | "HUMAN REQUIRED" | "AWAITING APPROVAL" | "ERROR" | "STOPPED";
export type ProjectInput = { projectName: string; specification: string; developmentMembers: number; qaMembers: number };
export type WorkItem = { id: string; area: string; owner: "development" | "qa"; hours: number; reason: string; evidence: string[]; assumption: boolean };
export type PlanDraft = {
  projectSummary: string; screens: number; functions: number; businessFlows: number; externalDependencies: number;
  estimateHours: number; confidence: number; coordinationDays: number; breakdown: WorkItem[];
  evidence: string[]; uncertainties: string[]; risks: string[]; assumptions: string[];
};
export type Plan = PlanDraft & { scheduleDays: number; scheduleReason: string; developmentMembers: number; qaMembers: number; evidenceCoverage: number; autonomyLevel: Autonomy };
export type Review = {
  summary: string; approved: boolean; confidence: number;
  findings: { severity: "blocking" | "warning" | "info"; issue: string; evidence: string; recommendation: string }[];
  checks: { workItemId: string; supported: boolean; quote: string; reason: string }[];
};
export type Attack = { name: string; vector: string; payload: string; targetHours: number; rationale: string };
export type Defense = { rootCause: string; rules: string[]; explanation: string };
export type TargetResult = { proposedEstimateHours: number; acceptedInstruction: boolean; reason: string };
export type Battle = {
  attack: Attack; before: TargetResult; after?: TargetResult; defense?: Defense;
  breached: boolean; blocked?: boolean; planIntact?: boolean; attackHash: string;
};
export type ChangeOption = { id: string; title: string; rationale: string; tradeoffs: string[]; developmentMembers: number; qaMembers: number; proposedSpecification: string; scopeChanges: string[]; expectedScheduleDays: number };
export type ChangeAnalysis = { impact: string; options: ChangeOption[]; recommendedOptionId: string; recommendationReason: string };
export type ChangeValidation = { requestSatisfied: boolean; adoptedOptionFeasible: boolean; explanation: string; unmetConstraints: string[] };
export type Snapshot = {
  input: ProjectInput; plan?: Plan; originalPlan?: Plan; review?: Review; battle?: Battle;
  changeRequest?: string; changeAnalysis?: ChangeAnalysis; selectedOption?: ChangeOption; changeValidation?: ChangeValidation;
  final: boolean; model: string; reviewRound: number;
};
export type StreamEvent =
  | { type: "phase"; phase: Phase; message: string }
  | { type: "log"; agent: string; message: string; level: "info" | "success" | "alert" }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "checkpoint"; token: string; purpose: "security" | "change" | "verified"; message: string }
  | { type: "error"; message: string };

// A small shared JSON-schema subset is also validated locally; model output is never trusted by a cast alone.
export type Schema = { type: "object" | "array" | "string" | "number" | "integer" | "boolean"; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: (string | number)[]; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; maxLength?: number; minLength?: number };
const str: Schema = { type: "string", minLength: 1, maxLength: 4000 };
const strings: Schema = { type: "array", items: str, maxItems: 30 };
const num = (minimum = 0, maximum = 100000): Schema => ({ type: "number", minimum, maximum });
const integer = (minimum = 0, maximum = 10000): Schema => ({ type: "integer", minimum, maximum });
const bool: Schema = { type: "boolean" };
const object = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties) });
const list = (items: Schema, minItems = 0, maxItems = 30): Schema => ({ type: "array", items, minItems, maxItems });
export const inputSchema = object({ projectName: { ...str, maxLength: 100 }, specification: { ...str, minLength: 20, maxLength: 30000 }, developmentMembers: integer(1, 50), qaMembers: integer(1, 50) });
export const planSchema = object({
  projectSummary: str, screens: integer(), functions: integer(), businessFlows: integer(), externalDependencies: integer(), estimateHours: num(1), confidence: num(0, 100), coordinationDays: integer(0, 30),
  breakdown: list(object({ id: { ...str, maxLength: 40 }, area: { ...str, enum: ["開発", "QA", "外部連携", "セキュリティ", "リリース対応"] }, owner: { ...str, enum: ["development", "qa"] }, hours: num(0.5), reason: str, evidence: strings, assumption: bool }), 5, 25),
  evidence: strings, uncertainties: strings, risks: strings, assumptions: strings,
});
export const reviewSchema = object({ summary: str, approved: bool, confidence: num(0, 100), findings: list(object({ severity: { ...str, enum: ["blocking", "warning", "info"] }, issue: str, evidence: str, recommendation: str })), checks: list(object({ workItemId: str, supported: bool, quote: { type: "string", maxLength: 4000 }, reason: str }), 1, 25) });
export const attackSchema = object({ name: str, vector: str, payload: { ...str, maxLength: 3000 }, targetHours: num(0.5), rationale: str });
export const defenseSchema = object({ rootCause: str, rules: list(str, 1, 8), explanation: str });
export const targetSchema = object({ proposedEstimateHours: num(0), acceptedInstruction: bool, reason: str });
export const changeSchema = object({ impact: str, options: list(object({ id: str, title: str, rationale: str, tradeoffs: strings, developmentMembers: integer(1, 50), qaMembers: integer(1, 50), proposedSpecification: { ...str, minLength: 20, maxLength: 30000 }, scopeChanges: strings, expectedScheduleDays: integer(1) }), 2, 3), recommendedOptionId: str, recommendationReason: str });
export const changeValidationSchema = object({ requestSatisfied: bool, adoptedOptionFeasible: bool, explanation: str, unmetConstraints: strings });

export class ValidationError extends Error {}
export function validate<T>(value: unknown, schema: Schema, path = "入力"): T {
  const fail = () => { throw new ValidationError(`${path}の形式または範囲が不正です。`); };
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail();
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) fail();
    for (const [key, child] of Object.entries(schema.properties ?? {})) validate(record[key], child, `${path}.${key}`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) fail();
    const array = value as unknown[];
    if (array.length < (schema.minItems ?? 0) || array.length > (schema.maxItems ?? 100)) fail();
    for (const child of array) validate(child, schema.items!, path);
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.trim().length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? 30000)) fail();
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") fail();
  } else {
    if (typeof value !== "number" || !Number.isFinite(value) || value < (schema.minimum ?? 0) || value > (schema.maximum ?? Infinity) || (schema.type === "integer" && !Number.isInteger(value))) fail();
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) fail();
  return value as T;
}

export function autonomy(confidence: number, coverage: number, blocked = false): Autonomy {
  if (blocked || confidence < 60 || coverage < 60) return "HUMAN_REQUIRED";
  return confidence >= 80 && coverage >= 90 ? "AUTONOMOUS" : "SUPERVISED";
}

export function materializePlan(draft: PlanDraft, input: ProjectInput): Plan {
  validate(draft, planSchema, "計画");
  const ids = new Set(draft.breakdown.map((item) => item.id));
  if (ids.size !== draft.breakdown.length || new Set(draft.breakdown.map((item) => item.area)).size !== 5) throw new ValidationError("作業IDの重複または必要な作業領域の欠落があります。");
  const total = draft.breakdown.reduce((sum, item) => sum + item.hours, 0);
  if (Math.abs(total - draft.estimateHours) > 0.1) throw new ValidationError("総工数と工数内訳の合計が一致しません。");
  const dev = draft.breakdown.filter((item) => item.owner === "development").reduce((sum, item) => sum + item.hours, 0);
  const qa = total - dev;
  if (dev <= 0 || qa <= 0) throw new ValidationError("開発とQAの両方の作業が必要です。");
  const scheduleDays = Math.ceil(dev / (input.developmentMembers * 8)) + Math.ceil(qa / (input.qaMembers * 8)) + draft.coordinationDays;
  const supported = draft.breakdown.filter((item) => !item.assumption && item.evidence.some((quote) => quote.trim().length >= 4 && input.specification.includes(quote))).length;
  const evidenceCoverage = Math.round(supported / draft.breakdown.length * 100);
  const confidence = Math.min(85, draft.confidence); // No actual historical baseline has been supplied.
  return { ...draft, estimateHours: Math.round(total * 10) / 10, confidence, scheduleDays, developmentMembers: input.developmentMembers, qaMembers: input.qaMembers, evidenceCoverage, autonomyLevel: autonomy(confidence, evidenceCoverage), scheduleReason: `推測: 1人1日8時間、開発側 ${dev}h ÷ ${input.developmentMembers}名、QA側 ${Math.round(qa * 10) / 10}h ÷ ${input.qaMembers}名を各切り上げ。工程を順番に実施する保守的なモデルに、調整・待機 ${draft.coordinationDays}営業日を加算。祝日・個人差・工程の重なりは未反映。` };
}

export function applyReview(plan: Plan, review: Review, specification: string): Plan {
  validate(review, reviewSchema, "QAレビュー");
  const ids = new Set(review.checks.map((check) => check.workItemId));
  if (ids.size !== review.checks.length || ids.size !== plan.breakdown.length || plan.breakdown.some((item) => !ids.has(item.id))) throw new ValidationError("QAレビューが全作業項目を一度ずつ検証していません。");
  const supported = review.checks.filter((check) => check.supported && check.quote.trim().length >= 4 && specification.includes(check.quote) && !plan.breakdown.find((item) => item.id === check.workItemId)!.assumption).length;
  const evidenceCoverage = Math.round(supported / plan.breakdown.length * 100);
  const confidence = Math.min(plan.confidence, review.confidence);
  return { ...plan, confidence, evidenceCoverage, autonomyLevel: autonomy(confidence, evidenceCoverage, !review.approved || review.findings.some((finding) => finding.severity === "blocking")) };
}
