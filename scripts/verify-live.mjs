// Uses only the local API and self-authored SmartShop data. Never logs keys or checkpoint tokens.
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.GUARDIAN_TEST_URL || "http://127.0.0.1:3100";
const specification = `SmartShop ECサイト仕様（実API疎通確認用の自作データ）
ユーザー: メールアドレスとパスワードによるログイン、パスワードリセット、商品一覧、商品詳細、検索、カテゴリ絞り込み、カート追加・数量変更・削除、カード決済、注文確認・完了・履歴。
管理者: 商品登録、在庫管理、注文管理。
外部依存: 決済サービス、メール送信サービス。
未定義: 決済失敗時の再試行、在庫同時更新の競合制御、リセットURL有効期限。
開発とQA、外部連携、セキュリティ確認、リリース対応を見積もり対象とする。未定義事項は決定済みにせず仮定とリスクを提示する。`;
const response = await fetch(`${base}/api/guardian`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "start", input: { projectName: "SmartShop", specification, developmentMembers: 3, qaMembers: 2 } }), signal: AbortSignal.timeout(900000) });
if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
let snapshot;
let phase;
let checkpoint;
let buffer = "";
const decoder = new TextDecoder();
async function receive(event) {
  if (event.type === "snapshot") snapshot = event.snapshot;
  if (event.type === "checkpoint") checkpoint = event;
  if (event.type === "phase") { phase = event.phase; console.log(`${event.phase}: ${event.message}`); }
  if (event.type === "log") console.log(`${event.agent}: ${event.message}`);
  if (event.type === "error") throw new Error(event.message);
}
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true });
  const lines = buffer.split("\n"); buffer = lines.pop() || "";
  for (const line of lines) if (line.trim()) await receive(JSON.parse(line));
}
buffer += decoder.decode();
if (buffer.trim()) await receive(JSON.parse(buffer));
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/live-verification.json", JSON.stringify({ phase, snapshot, checkpointPurpose: checkpoint?.purpose }, null, 2));
console.log(JSON.stringify({ phase, estimateHours: snapshot?.plan?.estimateHours, scheduleDays: snapshot?.plan?.scheduleDays, confidence: snapshot?.plan?.confidence, evidenceCoverage: snapshot?.plan?.evidenceCoverage, autonomy: snapshot?.plan?.autonomyLevel, checkpointPurpose: checkpoint?.purpose }));
