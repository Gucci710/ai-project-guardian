"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./launch-presentation.css";
import { MotionSurface } from "./ambient-motion";
import { launchVerdict } from "@/lib/launch/verdict";
import { PermissionChamber, PolicyComparison, VerificationOutcome } from "./guardian-visuals";
import { DEMOS, type Audit, type Diagnosis, type Event, type Result } from "@/lib/launch/contracts";

const STAGES = ["DIAGNOSIS", "RED TEAM", "SELF REPAIR", "RETEST", "WORK TEST", "VERIFIED"];
const STAGE_LABELS = ["設計を診断", "危険を再現", "権限を修正", "制限を検証", "業務を確認", "起動を判定"];
const NAMES: Record<string, string> = { "customer.read": "顧客データ", "files.read": "資料の参照", "mail.send": "外部送信", "files.delete": "ファイル削除", audit: "監査記録", limits: "実行上限" };
export default function LaunchPage() {
  const [input, setInput] = useState<string>(DEMOS.dangerous);
  const [busy, setBusy] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [phase, setPhase] = useState("READY");
  const [message, setMessage] = useState("作りたいエージェントを説明してください。");
  const [result, setResult] = useState<Result | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [visited, setVisited] = useState<string[]>([]);
  const [operationResult, setOperationResult] = useState<{ title: string; detail: string; output?: string; rule?: string; state: "pending" | "done" | "error" } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [audit]);
  function edit(value: string) { setDiagnosis(null); setInput(value); setToken(""); setResult(null); setAudit([]); setPhase("READY"); setVisited([]); setError(""); setOperationResult(null); setMessage("入力変更後は再審査が必要です。"); }
  async function review() {
    if (abort.current) return;
    const controller = new AbortController(); abort.current = controller;
    setDiagnosis(null);
    setBusy(true); setResult(null); setAudit([]); setToken(""); setError(""); setOperationResult(null); setVisited([]); setPhase("DIAGNOSIS"); setMessage("Geminiに接続しています…");
    let completed = false;
    function receive(line: string) {
      if (!line.trim()) return;
      const event = JSON.parse(line) as Event;
      if (event.type === "diagnosis") setDiagnosis(event.diagnosis);
      if (event.type === "phase") { setPhase(event.phase); setMessage(event.message); setVisited(v => [...new Set([...v, event.phase])]); }
      if (event.type === "audit") setAudit(a => [...a, event.entry]);
      if (event.type === "result") { setResult(event.result); setToken(event.token || ""); completed = true; }
      if (event.type === "error") throw new Error(event.message);
    }
    try {
      const response = await fetch("/api/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "review", input }), signal: controller.signal });
      if (!response.ok) throw new Error((await response.json()).error || "接続できませんでした。");
      const reader = response.body?.getReader(); if (!reader) throw new Error("ログを受信できませんでした。");
      const decoder = new TextDecoder(); let pending = "";
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; pending += decoder.decode(value, { stream: true }); const lines = pending.split("\n"); pending = lines.pop() || ""; lines.forEach(receive); } receive(pending + decoder.decode()); }
      finally { reader.releaseLock(); }
      if (!completed) throw new Error("検証完了前に接続が切れました。");
    } catch (caught) { const stopped = controller.signal.aborted; controller.abort(); setToken(""); setPhase("UNVERIFIED"); setError(stopped ? "実行を停止しました。未検証のため起動できません。" : caught instanceof Error ? caught.message : "検証に失敗しました。"); setMessage("未検証：起動許可は発行されていません。"); }
    finally { abort.current = null; setBusy(false); }
  }
  async function execute(operation: string) {
    if (abort.current) return;
    const controller = new AbortController(); abort.current = controller; setBusy(true); setError("");
    const action = operation === "draft" ? "下書き作成" : operation === "send" ? "送信" : "削除";
    setOperationResult({ title: `${action}を確認中…`, detail: "サーバーで権限を確認しています。", state: "pending" });
    try {
      const response = await fetch("/api/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "execute", token, operation }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const data = await response.json(); if (!response.ok) { setToken(""); throw new Error(data.error); }
      const last: Audit | undefined = data.audit?.at(-1);
      if (!last || typeof data.allowed !== "boolean") throw new Error("操作結果を確認できませんでした。もう一度お試しください。");
      const reasons: Record<string, string> = { SEND_DISABLED_APPROVAL_REQUIRED: "この起動許可ではメール送信を許可していません。外部への送信は行われていません。", DELETE_DISABLED: "この起動許可ではファイル削除を許可していません。ファイルは削除されていません。", CALL_LIMIT: "操作回数の上限に達したため、実行を停止しました。", DRAFT_FACTS_REJECTED: "回答内容と根拠が一致しないため、下書きを作成しませんでした。" };
      setOperationResult({ title: data.allowed ? operation === "draft" ? "返信下書きを作成しました" : `${action}操作が許可されました` : `${action}は拒否されました`, detail: data.allowed ? "合成データでの操作結果です。実際のメール送信やファイル操作は行いません。" : reasons[last.rule] || "権限チェックで実行を停止しました。詳細は監査ログで確認できます。", output: last.output, rule: last.rule, state: "done" });
      setAudit(a => [...a, ...data.audit.map((e: Audit, i: number) => ({ ...e, sequence: a.length + i + 1 }))]);
      setMessage(data.allowed ? "許可された範囲で返信下書きを作成しました。" : "実行直前の権限チェックで操作を拒否しました。監査ログを確認できます。");
    } catch (caught) { const detail = controller.signal.aborted ? "確認を中断しました。操作結果は確認できていません。" : caught instanceof Error ? caught.message : "操作に失敗しました。"; setError(detail); setOperationResult({ title: `${action}の確認を完了できませんでした`, detail, state: "error" }); }
    finally { abort.current = null; setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: "Agent Guardian audit export", scope: "design review and optional synthetic sandbox", result, audit }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "agent-guardian-audit.json"; a.click(); URL.revokeObjectURL(url);
  }
  const verdict = launchVerdict(result, busy, error);
  return <main className={`guardian ${result?.decision === "BLOCKED" || phase === "UNVERIFIED" ? "danger" : result?.decision === "LIMITED" ? "verified" : "repair"}`}>
    <div className="ambient-grid" /><div className="ambient-orb orb-one" />
    <div className="shell launch-shell" data-motion-enabled={motionEnabled}>
      <header className="header"><Link href="/" className="brand"><span className="launch-logo">⬡</span><div>AGENT <strong>GUARDIAN</strong><small>起動許可プロトコル</small></div></Link><div className="header-tools"><button className="tag motion-toggle" aria-label="画面のアニメーション" aria-pressed={motionEnabled} onClick={() => setMotionEnabled(value => !value)}><span aria-hidden="true">◌</span>演出 {motionEnabled ? "ON" : "OFF"}</button><Link className="tag" href="/planning">従来のプロジェクト計画</Link></div></header>
      <section className="hero"><div><p className="eyebrow">AGENT LAUNCH CONTROL</p><h1>そのエージェントに、<br /><span>起動許可を出せますか。</span></h1><p className="hero-description">危険な権限を見つけ、制限を設計し、実際に止められるか検証する。<br />必要な仕事ができることまで確かめる、AIの起動審査室。</p></div><div className="mission-signature"><span className="eyebrow">THE GUARDIAN PROTOCOL</span><strong>危険を見つける。<br />止められることを、確かめる。</strong><span className="tag">合成データの隔離環境</span></div></section>
      <MotionSurface className="verdict-motion"><section className={`verdict-banner ${verdict.tone}`} aria-label="起動判定" role="status"><div className="verdict-stamp">{verdict.code}</div><div><p className="eyebrow">LAUNCH DECISION</p><h2>{verdict.title}</h2><p>{verdict.reason}</p><p className="verdict-next"><strong>次のアクション：</strong>{verdict.next}</p></div></section></MotionSurface>
      <div className="mission-grid">
        <section className="panel input-panel"><div className="panel-heading"><div><p className="eyebrow">01 / MISSION</p><h2>エージェントの説明</h2></div></div>
          <div className="launch-examples">{([["dangerous", "危険な権限の例"], ["safe", "制限を明記した例"], ["unknown", "短い希望の例"], ["research", "調査エージェントの例"]] as const).map(([key, name]) => <button className="tag" disabled={busy} onClick={() => edit(DEMOS[key])} key={key}>{name}</button>)}</div>
          <form onSubmit={e => { e.preventDefault(); void review(); }}><label>どんな仕事を任せたいですか？<textarea ref={inputRef} rows={8} minLength={5} maxLength={12000} required disabled={busy} value={input} onChange={e => edit(e.target.value)} /></label><p className="field-help">調査・資料作成・開発支援など、作りたいものを自由に書いてください。設定が分からなくても、確認事項と説明案を提案します。</p><button className="button primary launch" disabled={busy || input.trim().length < 5}>設計診断を開始 <span>→</span></button></form>
          {busy && <button className="button stop" onClick={() => abort.current?.abort()}>実行を停止</button>}
          <p className="field-help">設計診断はどの業務でも利用できます。実行検証は現在、問い合わせ返信の合成環境のみ対応しています。</p><p className="field-help">Geminiによる診断・修正・業務検証。AI呼び出し最大5回（再試行・モデル切替を含め最大20リクエスト）、全体9分。各隔離実行は最大10操作。実データや機密情報は入力しないでください。</p>
        </section>
        <section className="panel launch-chamber" aria-live="polite"><div className="core-top"><div><p className="eyebrow">02 / PERMISSION CHAMBER</p><h2>起動審査室</h2></div><span className={`tag chamber-status ${busy ? "active" : ""}`}>{busy ? "審査中" : result ? "審査結果" : "入力待ち"}</span></div><PermissionChamber key={input} input={input} diagnosis={diagnosis} result={result} audit={audit} phase={phase} busy={busy} /><p className="launch-message">{message}</p><div className="launch-pipeline">{STAGES.map((s, i) => <span className={visited.includes(s) ? "done" : ""} key={s}><small>0{i + 1} / {s}</small><strong>{STAGE_LABELS[i]}</strong></span>)}</div></section>
      </div>
      {error && <p className="launch-error" role="alert">{error}</p>}
      <section className="launch-metrics">{[["修正前の危険度", result ? `${result.risk} / 100` : "—"], ["原文根拠の確認率", result ? `${result.coverage}%` : "—"], ["実行検証", result?.checks.length ? `${result.checks.filter(c => c.passed).length} / ${result.checks.length}` : "未実施"], ["起動判定", verdict.title]].map(([label, value]) => <div className="panel" key={label}><p>{label}</p><strong>{value}</strong></div>)}</section>
      {result && <>
        <VerificationOutcome result={result} />
        <section className="panel launch-section" aria-label="設計診断と次のステップ"><p className="eyebrow">DESIGN REVIEW / NEXT STEP</p><h2>希望を具体的な設計にする</h2><h3>理解した業務</h3><p>{result.diagnosis.guidance.task}</p>
          {result.decision === "DESIGN_ONLY" && <p>この業務の設計診断は完了しています。実行検証用の環境が未対応のため、説明を追記しても現時点では起動許可は発行されません。問い合わせ対応に書き換える必要はありません。</p>}
          {result.diagnosis.guidance.questions.length > 0 && <><h3>確認したいこと・回答例</h3><ol className="guidance-questions">{result.diagnosis.guidance.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></>}
          {result.diagnosis.guidance.additionalRisks.length > 0 && <><h3>この業務で気をつけること</h3><ul>{result.diagnosis.guidance.additionalRisks.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
          <h3>説明の改善案（未確定の提案を含みます）</h3><p className="launch-draft">{result.diagnosis.guidance.suggestedSpecification}</p><button className="button secondary" disabled={busy} onClick={() => { edit(result.diagnosis.guidance.suggestedSpecification); inputRef.current?.focus(); inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>この案を入力欄で編集する</button><p className="field-help">提案の内容を確認し、【要記入】を埋めてから再診断してください。ボタンを押すだけでは実行・承認されません。</p>
        </section>
        <section className="panel launch-section"><p className="eyebrow">EVIDENCE / PERMISSION MAP</p><h2>何が危険で、何が未確認か</h2><p>{result.diagnosis.summary}</p><div className="permission-map">{result.diagnosis.findings.map(f => <article key={f.capability} className={`permission-node ${f.status}`}><span className={`tag ${f.status === "danger" ? "red" : f.status === "safe" ? "green" : "amber"}`}>{f.status === "danger" ? "危険" : f.status === "safe" ? "制限あり" : "未確認"}</span><h3>{NAMES[f.capability]}</h3><p>{f.reason}</p>{f.quote && <blockquote>「{f.quote}」</blockquote>}</article>)}</div><details><summary>スコアと確認率の算出規則</summary><p>無承認送信・削除は100、その他の危険は75、未確認は50、明記された制限は0。6項目の最大値を採用。確認率は元入力に一致する4文字以上の引用で裏付けられた項目数÷6です。引用一致は意味の正しさや実環境の安全性を保証しません。</p></details></section>
        {result.repair && <section className="panel launch-section"><p className="eyebrow">BEFORE / AFTER</p><h2>安全に実行するための変更案</h2><PolicyComparison result={result} /><p>元の説明から何を変更し、どの操作を制限するかをまとめています。</p><details className="explanation-details"><summary>仕様の全文と変更理由を見る</summary><div className="launch-columns"><article><h3>元の説明</h3><p>{result.input}</p></article><article><h3>修正版仕様</h3><p>{result.repair.specification}</p></article></div><div className="launch-columns"><article><h3>変更理由</h3><ul>{result.repair.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></article><article><h3>残る制約</h3><ul>{result.repair.limitations.map((r, i) => <li key={i}>{r}</li>)}</ul></article></div></details><details><summary>機械で読み取れる権限ルール</summary><pre>{JSON.stringify(result.repair.policy, null, 2)}</pre></details></section>}
        {result.checks.length > 0 && <section className="panel launch-section"><p className="eyebrow">RETEST / ACTUAL ENFORCEMENT</p><h2>拒否できた操作・続けられた仕事</h2><div className="launch-table"><table><thead><tr><th>検証</th><th>実際の動作</th><th>適用ルール</th><th>判定</th></tr></thead><tbody>{result.checks.map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.actualAllowed ? "許可" : "拒否"}</td><td><code>{c.rule}</code></td><td>{c.passed ? "合格" : "不合格"}</td></tr>)}</tbody></table></div><p className="field-help">危険操作は再現可能なテスト入力です。初回のシミュレーションは、AIが攻撃に騙された実績ではありません。</p></section>}
        {result.replyChecks && <section className="panel launch-section"><p className="eyebrow">ANSWER REVIEW / SOURCE VERIFICATION</p><h2>回答内容と根拠の照合</h2><p>顧客・注文・返品条件を、許可された参照結果と照合しています。1つでも不一致なら下書きと起動許可を出しません。</p><div className="launch-table"><table><thead><tr><th>確認項目</th><th>検証方法</th><th>結果</th></tr></thead><tbody>{result.replyChecks.map(c => <tr key={c.name}><td>{c.name}</td><td>{c.reason}</td><td>{c.passed ? "一致" : "不一致・作成を停止"}</td></tr>)}</tbody></table></div></section>}
        {result.draft && <section className="panel launch-section"><p className="eyebrow">NORMAL WORK / GEMINI</p><h2>正常業務：返信下書き</h2><p className="launch-draft">{result.draft}</p><p className="field-help">{result.model} が回答項目を抽出し、根拠との一致を確認して定型文へ変換しました。合成データの顧客・注文・返品条件が検証対象です。自由文全般の意味的正確性を保証するものではありません。送信前は人が最終確認してください。</p></section>}
        {(token || operationResult) && <section className="panel launch-section"><p className="eyebrow">LIMITED LAUNCH</p><h2>許可・拒否の動作を試す</h2><p>署名付き許可は発行から10分間有効。入力変更後は再審査が必要です。下書きは作成でき、送信・削除は拒否されることを確認できます。結果はボタンの下に表示されます。</p><div className="launch-actions"><button className="button primary" disabled={busy || !token} onClick={() => void execute("draft")}>制限付き起動：下書きを作成</button><button className="button secondary" disabled={busy || !token} onClick={() => void execute("send")}>送信の拒否を確認</button><button className="button secondary" disabled={busy || !token} onClick={() => void execute("delete")}>削除の拒否を確認</button></div><div role="status" aria-live="polite" aria-atomic="true" aria-label="操作確認の結果">{operationResult && <div className={`operation-result ${operationResult.state}`}><h3>{operationResult.title}</h3><p>{operationResult.detail}</p>{operationResult.output && <p className="launch-draft">{operationResult.output}</p>}{operationResult.rule && <details><summary>適用されたルール</summary><code>{operationResult.rule}</code><p>この結果は監査ログと保存用JSONにも記録されます。</p></details>}</div>}</div><p className="field-help">起動時の下書きは公開FAQを使う定型文です。送信の承認・外部連携は未対応です。</p></section>}
      </>}
      <section className="panel launch-section"><div className="panel-heading"><div><p className="eyebrow">LIVE ACTIVITY / AUDIT</p><h2>判断と実行の記録</h2></div><button className="button secondary" onClick={download} disabled={!audit.length || busy}>監査JSONを保存</button></div><div className="launch-log" ref={log} role="log" aria-label="監査ログ">{!audit.length && <p>審査を開始すると、操作と適用ルールがここに記録されます。</p>}{audit.map(e => <div key={e.sequence} className={e.allowed ? "" : "denied"}><small>{new Date(e.at).toLocaleTimeString("ja-JP")} / {e.stage}</small><strong>{e.rule === "WORKFLOW" || e.stage === "INPUT" ? "記録" : e.allowed ? "許可" : "拒否"} · {e.rule}</strong><p>{e.action}</p>{e.output && <details><summary>出力</summary><p>{e.output}</p></details>}</div>)}</div></section>
      <footer className="launch-footer">検証対象はGuardian内の隔離環境です。外部の任意のエージェントを停止する機能ではありません。監査記録はページ更新で失われます。必要な記録はJSONで保存してください。</footer>
    </div>
  </main>;
}
