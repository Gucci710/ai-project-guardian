"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Phase, ProjectInput, Snapshot, StreamEvent } from "@/lib/guardian/contracts";
import { SMARTSHOP_SPECIFICATION } from "@/lib/guardian/demo";

type Activity = { id: number; time: string; agent: string; message: string; level: "info" | "success" | "alert" };
type Checkpoint = Extract<StreamEvent, { type: "checkpoint" }>;
const PIPELINE = [
  { name: "PLANNING", label: "仕様解析・計画", phases: ["PLANNING", "PLAN REPAIR"] },
  { name: "QA REVIEW", label: "根拠を疑う", phases: ["QA REVIEW"] },
  { name: "RED TEAM", label: "隔離環境で攻撃", phases: ["RED TEAM", "BREACH DETECTED"] },
  { name: "BLUE TEAM", label: "防御ルールを修復", phases: ["BLUE TEAM", "SELF REPAIR"] },
  { name: "RETEST", label: "同じ攻撃で再検証", phases: ["RETEST", "VERIFIED", "FINAL VERIFIED"] },
];

export default function Home() {
  const [input, setInput] = useState<ProjectInput>({ projectName: "SmartShop", specification: SMARTSHOP_SPECIFICATION, developmentMembers: 3, qaMembers: 2 });
  const [phase, setPhase] = useState<Phase>("READY");
  const [message, setMessage] = useState("仕様を預ける。AIの判断を、別のAIが検証する。");
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [logs, setLogs] = useState<Activity[]>([]);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [error, setError] = useState("");
  const [changeRequest, setChangeRequest] = useState("リリースを3営業日早めたい。品質基準を維持し、追加人数やスコープの変更は代替案として提示してください。");
  const [selectedOption, setSelectedOption] = useState("");
  const [visited, setVisited] = useState<string[]>([]);
  const [followLog, setFollowLog] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const logId = useRef(0);
  const lastAction = useRef<Record<string, unknown> | null>(null);
  const retryCheckpoint = useRef<Checkpoint | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const container = logEnd.current?.parentElement;
    if (followLog && container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [logs, followLog]);

  function addLog(agent: string, text: string, level: Activity["level"] = "info") {
    setLogs((previous) => [...previous, { id: ++logId.current, time: new Date().toLocaleTimeString("ja-JP", { hour12: false }), agent, message: text, level }]);
  }

  async function run(action: Record<string, unknown>) {
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    lastAction.current = action;
    if (checkpoint) retryCheckpoint.current = checkpoint;
    setBusy(true); setError(""); setCheckpoint(null);
    if (action.kind === "start") {
      setLogs([]); setSnapshot(null); setVisited([]); setSelectedOption("");
      retryCheckpoint.current = null;
    }
    if (action.kind === "change" || (action.kind === "resume" && action.optionId)) setVisited([]);
    setPhase(action.kind === "change" ? "REPLANNING" : "PLANNING");
    setMessage("Agentに接続しています…");
    let terminal = false;
    const receive = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as StreamEvent | { type: "heartbeat" };
      if (event.type === "phase") {
        setPhase(event.phase); setMessage(event.message);
        setVisited((previous) => previous.includes(event.phase) ? previous : [...previous, event.phase]);
        addLog(event.phase, event.message, event.phase === "BREACH DETECTED" || event.phase === "HUMAN REQUIRED" ? "alert" : "info");
        if (event.phase === "HUMAN REQUIRED") terminal = true;
      } else if (event.type === "log") addLog(event.agent, event.message, event.level);
      else if (event.type === "snapshot") {
        setSnapshot(event.snapshot);
        if (event.snapshot.changeAnalysis && !event.snapshot.selectedOption) setSelectedOption(event.snapshot.changeAnalysis.recommendedOptionId);
      } else if (event.type === "checkpoint") { setCheckpoint(event); terminal = true; }
      else if (event.type === "error") throw new Error(event.message);
    };
    try {
      const response = await fetch("/api/guardian", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action), signal: controller.signal });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Agentに接続できませんでした。");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("実行ログを受信できませんでした。");
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(receive);
        }
        buffer += decoder.decode();
        receive(buffer);
      } finally { reader.releaseLock(); }
      if (!terminal) throw new Error("検証が完了する前に接続が切れました。再実行してください。");
    } catch (caught) {
      controller.abort();
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setPhase("STOPPED"); setMessage("実行を停止しました。実行済みの結果を表示しています。"); addLog("SYSTEM", "ユーザーが実行を停止しました。");
      } else {
        const text = caught instanceof Error ? caught.message : "実行に失敗しました。";
        setError(text); setPhase("ERROR"); setMessage("検証を完了できませんでした"); addLog("SYSTEM", text, "alert");
      }
      setCheckpoint(retryCheckpoint.current);
    } finally { abortRef.current = null; setBusy(false); }
  }

  function start(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void run({ kind: "start", input }); }
  const plan = snapshot?.plan;
  const battle = snapshot?.battle;
  const verified = phase === "VERIFIED" || phase === "FINAL VERIFIED";
  const danger = ["RED TEAM", "BREACH DETECTED"].includes(phase);
  const repair = ["BLUE TEAM", "SELF REPAIR", "RETEST"].includes(phase);
  const tone = danger ? "danger" : verified ? "verified" : repair ? "repair" : "normal";

  return (
    <main className={`guardian ${tone} ${busy ? "is-running" : "is-idle"}`}>
      {["BREACH DETECTED", "SELF REPAIR", "FINAL VERIFIED"].includes(phase) && <div key={phase} className="event-flash" aria-hidden="true"><div><span>{phase}</span><small>{phase === "BREACH DETECTED" ? "隔離コピーで根拠のない改変を検出" : phase === "SELF REPAIR" ? "生成した防御ルールを適用" : "変更後の計画を再検証"}</small></div></div>}
      <div className="ambient-grid" aria-hidden="true" /><div className="ambient-orb orb-one" aria-hidden="true" /><div className="ambient-orb orb-two" aria-hidden="true" />
      <div className="shell">
        <header className="header">
          <Link className="brand" href="/" aria-label="AI Project Guardian ホーム"><Shield /><span>AI PROJECT <strong>GUARDIAN</strong><small>AUTONOMOUS VERIFICATION SYSTEM</small></span></Link>
          <div className="header-meta"><span className={`connection ${busy ? "active" : ""}`}><i />{busy ? "AGENTS ONLINE" : "MISSION CONTROL"}</span><span className="project-code">{snapshot?.input.projectName || input.projectName}</span></div>
        </header>

        <section className="hero">
          <div><p className="eyebrow">TRUST IS EARNED. NEVER ASSUMED.</p><h1>AIの判断に、<br /><span>信頼の証拠を。</span></h1><p className="hero-description">計画するAI。疑うAI。攻撃し、修復するAI。<br />その判断を任せられるか、根拠と検証で確かめる。</p></div>
          <div className="hero-stamp"><span>01 — 05</span><strong>PLAN / CHALLENGE<br />REPAIR / VERIFY</strong><small>開発＋QAのプロジェクト全体を検証</small></div>
        </section>

        <div className="mission-grid">
          <section className="panel input-panel">
            <div className="panel-heading"><div><p className="eyebrow">MISSION BRIEF</p><h2>プロジェクト設定</h2></div><span className="tag">{input.specification === SMARTSHOP_SPECIFICATION ? "自作デモ仕様" : "入力仕様"}</span></div>
            <form onSubmit={start}>
              <fieldset disabled={busy}>
                <label>プロジェクト名<input value={input.projectName} onChange={(event) => setInput({ ...input, projectName: event.target.value })} required maxLength={100} /></label>
                <div className="team-fields"><label>開発人数<span className="number-field"><input type="number" min={1} max={50} required value={input.developmentMembers || ""} onChange={(event) => setInput({ ...input, developmentMembers: Number(event.target.value) })} /><span>名</span></span></label><label>QA人数<span className="number-field"><input type="number" min={1} max={50} required value={input.qaMembers || ""} onChange={(event) => setInput({ ...input, qaMembers: Number(event.target.value) })} /><span>名</span></span></label></div>
                <label>プロジェクト仕様<textarea value={input.specification} onChange={(event) => setInput({ ...input, specification: event.target.value })} required minLength={20} maxLength={30000} rows={snapshot ? 7 : 10} /></label>
                <p className="field-help">仕様から工数を見積もり、人数から期間を算出します。実績データは未登録です。</p>
                <button className="button primary launch" type="submit"><span>▶</span>{snapshot ? "この設定で新しく検証する" : "プロジェクト検証を開始"}<span>↗</span></button>
              </fieldset>
            </form>
            {busy && <button className="button stop" onClick={() => abortRef.current?.abort()}>■ 実行を停止</button>}
            <p className="input-footnote">入力には自作仕様・合成データ・公開情報を使用してください。</p>
          </section>

          <section className="panel core-panel" aria-label="Agentの実行状態">
            <div className="core-top"><span className="eyebrow">GUARDIAN NEURAL CORE</span><span className="core-coordinate">SYSTEM / {snapshot?.model ?? "GEMINI"}</span></div>
            <div className="core-stage" aria-hidden="true">
              <div className="radar-ring ring-outer" /><div className="radar-ring ring-middle" /><div className="radar-ring ring-inner" />
              <div className="orbit-dot dot-one" /><div className="orbit-dot dot-two" /><div className="core-beam" />
              <div className="core-hex hex-back" /><div className="core-hex hex-front"><Shield /><span>{danger ? "!" : verified ? "✓" : "G"}</span></div>
              <span className="core-label label-left">EVIDENCE<br /><b>{plan ? `${plan.evidenceCoverage}%` : "—"}</b></span><span className="core-label label-right">CONFIDENCE<br /><b>{plan ? `${plan.confidence}%` : "—"}</b></span>
              <div className="core-crosshair crosshair-one" /><div className="core-crosshair crosshair-two" />
            </div>
            <div className="phase-block" role="status" aria-live="polite"><span className="phase-kicker">{busy ? "LIVE EXECUTION" : verified ? "VALIDATION COMPLETE" : "CONTROL STATUS"}</span><h2 key={phase} className="phase-title">{phase}</h2><p>{message}</p></div>
            <div className="core-bottom"><span><i />{busy ? "実Agentが処理中" : "待機・停止中"}</span><span>攻撃対象: 隔離された見積もり更新処理</span></div>
          </section>
        </div>

        <section className="pipeline" aria-label="Agent Pipeline">{PIPELINE.map((agent, index) => {
          const active = busy && agent.phases.includes(phase);
          const passed = agent.phases.some((item) => visited.includes(item));
          return <div key={agent.name} className={`pipeline-step ${active ? "active" : passed ? "visited" : ""} ${index === 2 ? "red-step" : index === 3 ? "blue-step" : ""}`}><span className="step-number">0{index + 1}</span><div><strong>{agent.name}</strong><small>{agent.label}</small></div><span className="step-mark">{active ? "◉" : passed ? "•" : "○"}</span></div>;
        })}</section>

        {error && <section className="alert-box" role="alert"><div><strong>実行を完了できませんでした</strong><p>{error}</p></div><button className="button secondary" disabled={busy} onClick={() => lastAction.current && void run(lastAction.current)}>同じ操作を再試行</button></section>}
        {phase === "HUMAN REQUIRED" && <section className="alert-box"><div><strong>人による確認が必要です</strong><p>QAの指摘・根拠不足・再検証結果を確認し、上の仕様を補足して新しく検証してください。AIはこの状態から自動で続行しません。</p></div></section>}

        <section className="kpis" aria-label="プロジェクト指標">
          <Kpi label="プロジェクト総工数" value={plan ? `${plan.estimateHours}` : "—"} unit="h" caption="開発＋QA＋関連作業" />
          <Kpi label="想定営業日" value={plan ? `${plan.scheduleDays}` : "—"} unit="日" caption={plan ? `開発 ${plan.developmentMembers}名 / QA ${plan.qaMembers}名 / 計 ${plan.developmentMembers + plan.qaMembers}名` : "チーム構成から算出"} />
          <Kpi label="信頼度" value={plan ? `${plan.confidence}` : "—"} unit="%" caption="AIの評価値・正解確率ではありません" />
          <Kpi label="根拠の確認率" value={plan ? `${plan.evidenceCoverage}` : "—"} unit="%" caption="Evidence Coverage" />
          <Kpi label="自律性レベル" value={plan?.autonomyLevel.replaceAll("_", " ") ?? "—"} caption={plan && !snapshot?.review ? "QA前の暫定評価・権限は未確定" : "根拠とQA承認で実行権限を制御"} compact />
        </section>

        <div className="results-grid">
          <section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">LIVE ACTIVITY</p><h2>Agentの判断と行動</h2></div><label className="checkbox-label"><input type="checkbox" checked={followLog} onChange={(event) => setFollowLog(event.target.checked)} />自動追従</label></div><div className="activity-log" role="log" aria-label="実行ログ">{logs.length ? logs.map((log) => <div key={log.id} className={`log-entry ${log.level}`}><time>{log.time}</time><span className="log-line" /><div><strong>{log.agent}</strong><p>{log.message}</p></div></div>) : <div className="empty-log"><span>⌘</span><p>検証を開始すると、各Agentの判断が<br />ここにリアルタイムで届きます。</p></div>}<div ref={logEnd} /></div><div className="activity-footer"><span className={busy ? "pulsing" : ""}>●</span>{busy ? "サーバーから実行状況を受信中" : `${logs.length}件の実行記録`}</div></section>

          <section className="panel evidence-panel"><div className="panel-heading"><div><p className="eyebrow">EVIDENCE & JUDGMENT</p><h2>判断を信頼できる理由</h2></div><span className="tag">{snapshot?.review ? `QA ${snapshot.reviewRound}回目` : "根拠を追跡"}</span></div>{plan ? <><p className="summary-text">{plan.projectSummary}</p><div className="scale-grid">{[["画面", plan.screens], ["機能", plan.functions], ["業務フロー", plan.businessFlows], ["外部依存", plan.externalDependencies]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="coverage-title"><span>元仕様に引用が存在する作業</span><strong>{plan.evidenceCoverage}%</strong></div><div className="coverage-bar"><span style={{ width: `${plan.evidenceCoverage}%` }} /></div><p className="field-help">全作業項目を分母に、原文引用があり推測ではない項目を集計。QA後はQAの支持判定も必要です。引用の存在だけで工数の正しさは証明できません。</p>{snapshot?.review && <div className="review-summary"><span className={`tag ${snapshot.review.approved && !snapshot.review.findings.some((item) => item.severity === "blocking") ? "green" : "red"}`}>{snapshot.review.approved && !snapshot.review.findings.some((item) => item.severity === "blocking") ? "QA 承認" : "QA 要修正"}</span><p>{snapshot.review.summary}</p></div>}<InfoList title="不確実性・確認が必要な仕様" items={plan.uncertainties} tone="amber" /><InfoList title="計画上のリスク" items={plan.risks} tone="red" /><InfoList title="推測・前提条件" items={plan.assumptions} /><details><summary>信頼度と自律性の判定ルール</summary><p>信頼度80以上・根拠90%以上でAUTONOMOUS。両方60以上ならSUPERVISEDで承認待ち。それ未満、QA未承認、重大指摘、再検証失敗はHUMAN REQUIRED。実績データがないため信頼度は最大85。実行後の信頼度はPlanningとQAの低い方を採用します。</p></details></> : <div className="evidence-empty"><Shield /><h3>数字だけでは、信頼しない。</h3><p>仕様の引用、推測、不確実性を分離。<br />QAがその根拠を独立して検証します。</p><div className="empty-chips"><span>仕様の原文</span><span>作業の根拠</span><span>QAの判断</span></div></div>}</section>
        </div>

        {plan && <section className="panel breakdown-panel"><div className="panel-heading"><div><p className="eyebrow">PLANNING EVIDENCE</p><h2>工数内訳と仕様の根拠</h2></div><span className="tag">合計 {plan.estimateHours}h</span></div><p className="schedule-reason">{plan.scheduleReason}</p><div className="work-list">{plan.breakdown.map((work) => {
          const check = snapshot?.review?.checks.find((item) => item.workItemId === work.id);
          return <details key={work.id} className="work-item"><summary><span className="work-area">{work.area}</span><span className="work-reason">{work.reason}</span><span className={`tag ${work.assumption ? "amber" : ""}`}>{work.assumption ? "推測を含む" : "仕様に基づく"}</span><strong>{work.hours}<small>h</small></strong></summary><div className="work-details"><p>担当: {work.owner === "development" ? "開発" : "QA"} / 作業ID: {work.id}</p>{work.evidence.map((quote, index) => <blockquote key={index}>{quote}<small>{snapshot.input.specification.includes(quote) ? "原仕様に引用あり" : "原仕様との一致を確認できません"}</small></blockquote>)}{!work.evidence.length && <p>引用なし。仮定として確認が必要です。</p>}{check && <p><b>QAの判断:</b> {check.reason}{check.quote && ` / 引用: ${check.quote}`}</p>}</div></details>;
        })}</div><InfoList title="Planningが抽出した根拠" items={plan.evidence} />{snapshot?.review && <div className="findings"><h3>QAの指摘</h3>{snapshot.review.findings.length ? snapshot.review.findings.map((finding, index) => <article key={index} className={`finding ${finding.severity}`}><span className="tag">{finding.severity === "blocking" ? "要修正" : finding.severity === "warning" ? "要確認" : "参考"}</span><div><strong>{finding.issue}</strong><p>{finding.evidence}</p><p>対応: {finding.recommendation}</p></div></article>) : <p className="muted">今回のレビューで指摘はありません。</p>}</div>}</section>}

        {checkpoint?.purpose === "security" && !busy && <section className="approval-panel"><div><p className="eyebrow">SUPERVISED EXECUTION</p><h2>計画の内容を確認してください</h2><p>上の根拠・仮定・QAの指摘を確認したうえで、安全な攻撃シミュレーションへ進めます。</p></div><button className="button primary" onClick={() => void run({ kind: "resume", token: checkpoint.token, approved: true })}>内容を確認して検証を続行 →</button></section>}

        {battle && <section className={`battle-panel ${battle.blocked ? "battle-won" : ""}`}><div className="battle-heading"><div><p className="eyebrow">ADVERSARIAL SECURITY LAB</p><h2>RED TEAM <span>×</span> BLUE TEAM</h2><p>見積もり更新Agentの隔離コピーで比較。正式な計画は保護されます。</p></div><span className="tag">{battle.after ? battle.blocked ? "ATTACK BLOCKED" : "HUMAN REQUIRED" : battle.breached ? "BREACH DETECTED" : "ATTACK REJECTED"}</span></div><div className="battle-columns"><article className="red-console"><div className="console-label"><span>01 / BEFORE</span><b>RED TEAM</b></div><h3>{battle.attack.name}</h3><p>{battle.attack.rationale}</p><pre>{battle.attack.payload}</pre><div className="battle-number"><small>旧版コピーの更新提案</small><strong>{battle.before.proposedEstimateHours}<span>h</span></strong></div><p>{battle.before.reason}</p><span className="tag red">{battle.breached ? "根拠のない変更を検出" : "旧版も変更を拒否"}</span></article><div className="battle-divider"><span>⚡</span><small>SELF<br />REPAIR</small></div><article className="blue-console"><div className="console-label"><span>02 / AFTER</span><b>BLUE TEAM</b></div><h3>{battle.defense ? "防御ルールを適用" : "攻撃結果を分析中"}</h3>{battle.defense && <><p>{battle.defense.rootCause}</p><InfoList title="適用したルール" items={battle.defense.rules} /><p>{battle.defense.explanation}</p></>}{battle.after ? <><div className="battle-number"><small>防御後コピーの更新提案</small><strong>{battle.after.proposedEstimateHours}<span>h</span></strong></div><p>{battle.after.reason}</p><span className={`tag ${battle.blocked ? "green" : "red"}`}>{battle.blocked ? "同一攻撃を拒否" : "防御を再確認してください"}</span></> : <p className="muted">再検証の結果を待っています。</p>}</article></div><div className="battle-proof"><span>攻撃SHA-256: <code>{battle.attackHash.slice(0, 20)}…</code></span><span>{battle.planIntact === undefined ? "正式計画は未信頼の変更から隔離" : battle.planIntact ? "✓ 工数・根拠・信頼度の不変を確認" : "整合性を確認できません"}</span></div></section>}

        {(checkpoint?.purpose === "verified" || snapshot?.changeAnalysis) && <section className="panel change-panel"><div className="panel-heading"><div><p className="eyebrow">ADAPTIVE REPLANNING</p><h2>変化しても、もう一度検証する。</h2></div><span className="tag amber">CLIENT CHANGE REQUEST</span></div>{checkpoint?.purpose === "verified" && <form onSubmit={(event) => { event.preventDefault(); void run({ kind: "change", token: checkpoint.token, changeRequest }); }}><label>変更要求<textarea rows={3} value={changeRequest} maxLength={4000} required disabled={busy} onChange={(event) => setChangeRequest(event.target.value)} /></label><button className="button secondary" disabled={busy}>影響を分析して代替案を作る ↗</button></form>}{snapshot?.changeAnalysis && <><p className="summary-text">{snapshot.changeAnalysis.impact}</p><p className="field-help">推奨理由: {snapshot.changeAnalysis.recommendationReason}</p><div className="option-grid">{snapshot.changeAnalysis.options.map((option) => <article key={option.id} className={`option-card ${selectedOption === option.id ? "selected" : ""}`}><label className="option-choice"><input type="radio" name="changeOption" checked={selectedOption === option.id} onChange={() => setSelectedOption(option.id)} disabled={busy || checkpoint?.purpose !== "change"} /><span>{option.id}{option.id === snapshot.changeAnalysis!.recommendedOptionId && " / AI推奨"}</span></label><h3>{option.title}</h3><p>{option.rationale}</p><div className="option-metric">{option.expectedScheduleDays}<small>営業日・未検証の予測</small></div><p>開発 {option.developmentMembers}名 / QA {option.qaMembers}名</p><InfoList title="トレードオフ" items={option.tradeoffs} /><InfoList title="仕様の変更点" items={option.scopeChanges} /><details><summary>採用後の仕様全文</summary><pre className="spec-preview">{option.proposedSpecification}</pre></details></article>)}</div>{checkpoint?.purpose === "change" && !busy && <button className="button primary" disabled={!selectedOption} onClick={() => void run({ kind: "resume", token: checkpoint.token, approved: true, optionId: selectedOption })}>選択した案を採用し、再見積もり・再検証 →</button>}</>}{snapshot?.originalPlan && plan && snapshot.selectedOption && <div className="comparison"><div><span>変更前</span><strong>{snapshot.originalPlan.estimateHours}h / {snapshot.originalPlan.scheduleDays}営業日</strong></div><span>→</span><div><span>採用案の再計算結果</span><strong>{plan.estimateHours}h / {plan.scheduleDays}営業日</strong><small>差分 {signed(plan.estimateHours - snapshot.originalPlan.estimateHours)}h / {signed(plan.scheduleDays - snapshot.originalPlan.scheduleDays)}営業日</small></div></div>}</section>}

        {snapshot?.changeValidation && <section className="panel change-panel"><div className="panel-heading"><div><p className="eyebrow">CHANGE VALIDATION</p><h2>変更要求と実際の計画を照合</h2></div><span className={`tag ${snapshot.changeValidation.requestSatisfied ? "green" : "amber"}`}>{snapshot.changeValidation.requestSatisfied ? "元の変更要求を充足" : "元の変更要求に未達の条件あり"}</span></div><p className="summary-text">{snapshot.changeValidation.explanation}</p><InfoList title="満たしていない条件" items={snapshot.changeValidation.unmetConstraints} tone="amber" /><p className="field-help">{snapshot.changeValidation.adoptedOptionFeasible ? "採用案の条件内で成立すると評価されました。元要求との差は、承認したトレードオフと併せて確認してください。" : "採用案の条件を満たせないため、自動実行を停止しています。"}</p></section>}

        {verified && <section className="verified-banner"><Shield /><div><p className="eyebrow">EVIDENCE-BASED VERIFICATION</p><h2>{phase}</h2><p>QA承認・今回の攻撃拒否・計画の整合性を確認。<br />あらゆる攻撃への安全性や納期達成を保証するものではありません。</p></div><button className="button secondary" onClick={() => {
          if (!snapshot) return;
          const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), phase, snapshot, logs }, null, 2)], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = "guardian-verification.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>検証記録を保存 ↓</button></section>}

        <footer className="footer"><span>AI PROJECT GUARDIAN <b> / </b> TRUST THROUGH EVIDENCE</span><span>自作デモ仕様 · 実Gemini Agent · 安全な攻撃シミュレーション</span></footer>
      </div>
    </main>
  );
}

function signed(value: number) { return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}`; }
function Shield() { return <svg viewBox="0 0 64 72" fill="none" aria-hidden="true"><path d="M32 3 59 14v21c0 16-14 28-27 34C19 63 5 51 5 35V14L32 3Z" stroke="currentColor" strokeWidth="2" /><path d="m32 13 18 7v15c0 11-9 20-18 25-9-5-18-14-18-25V20l18-7Z" stroke="currentColor" opacity=".4" /><path d="m22 35 7 7 14-16" stroke="currentColor" strokeWidth="3" /></svg>; }
function Kpi({ label, value, unit, caption, compact }: { label: string; value: string; unit?: string; caption: string; compact?: boolean }) { return <div className="kpi"><p>{label}</p><strong className={compact ? "compact" : ""}>{value}<small>{unit}</small></strong><span>{caption}</span></div>; }
function InfoList({ title, items, tone = "" }: { title: string; items: string[]; tone?: string }) { return <div className={`info-list ${tone}`}><h3>{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">報告されていません。</p>}</div>; }
