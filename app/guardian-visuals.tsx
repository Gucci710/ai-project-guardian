"use client";

import { useState } from "react";
import type { Audit, Result } from "@/lib/launch/contracts";

const routes = [
  { id: "customer.read", name: "顧客情報", icon: "◎", position: "customer", path: "M145 55 H235 L315 105", target: "demo-customer" },
  { id: "files.read", name: "参照資料", icon: "▤", position: "files", path: "M145 170 H235 L315 135", target: "faq" },
  { id: "mail.send", name: "メール送信", icon: "↗", position: "send", path: "M385 105 L465 55 H555", target: "external@example.invalid" },
  { id: "files.delete", name: "ファイル削除", icon: "×", position: "delete", path: "M385 135 L465 170 H555", target: "faq" },
  { id: "mail.draft", name: "返信下書き", icon: "✎", position: "draft", path: "M350 165 V280", target: "demo-customer" },
];
type Tone = "idle" | "danger" | "allowed" | "blocked";

export function PermissionChamber({ result, audit, phase, busy }: { result: Result | null; audit: Audit[]; phase: string; busy: boolean }) {
  const [view, setView] = useState<"before" | "after">("after");
  const [selected, setSelected] = useState("customer.read");
  const nodes = routes.map(route => {
    const finding = result?.diagnosis.findings.find(f => f.capability === route.id);
    let tone: Tone = "idle", label = "未検証", detail = "審査を開始すると、実際の操作結果を表示します。";
    if (result && view === "before") {
      tone = finding?.status === "danger" ? "danger" : "idle";
      label = finding?.status === "danger" ? "危険な設定" : finding?.status === "safe" ? "制限の記載あり" : "記載なし・未確認";
      detail = finding ? `${finding.reason}${finding.quote ? ` 根拠：「${finding.quote}」` : ""}` : "下書きの設定は診断の6項目に含まれていません。";
    } else {
      const entry = [...audit].reverse().find(e => e.action.startsWith(`${route.id} →`) && e.stage !== "BEFORE SIMULATION");
      const check = result?.checks.find(c => c.call.tool === route.id && c.call.target === route.target);
      if (entry || check) {
        const allowed = entry ? entry.allowed : check!.actualAllowed;
        tone = allowed ? "allowed" : "blocked";
        label = allowed ? "実行を許可" : "実行を拒否";
        detail = entry ? `${entry.stage}で${entry.action}を${allowed ? "許可" : "拒否"}しました。適用ルール：${entry.rule}` : `再検証で${allowed ? "許可" : "拒否"}しました。適用ルール：${check!.rule}`;
      } else if (!result) {
        const before = [...audit].reverse().find(e => e.stage === "BEFORE SIMULATION" && e.action.startsWith(`${route.id} →`));
        if (before) { tone = "danger"; label = "修復前の疑似実行"; detail = "診断から再現した危険な権限のシミュレーションです。実データへの操作ではありません。"; }
      } else if (result.decision === "DESIGN_ONLY" || result.decision === "NEEDS_INPUT") {
        detail = "設計診断のみ完了しています。この経路の実行検証は行っていません。";
      }
    }
    return { ...route, tone, label, detail };
  });
  const active = nodes.find(n => n.id === selected)!;
  const verified = result?.decision === "LIMITED" && view === "after";
  return <div className={`permission-theater ${busy ? "is-working" : ""}`}>
    <div className="theater-toolbar"><div><span className="eyebrow">TRUST BOUNDARY</span><p>データと操作の経路</p></div>{result && <div className="view-switch" aria-label="経路図の表示切替"><button aria-pressed={view === "before"} onClick={() => setView("before")}>診断した設定</button><button aria-pressed={view === "after"} onClick={() => setView("after")}>実行検証の結果</button></div>}</div>
    <div className="route-map" aria-label="権限とデータの経路図">
      <svg viewBox="0 0 700 330" preserveAspectRatio="none" aria-hidden="true" className="route-wires">{nodes.map(node => <g key={node.id} className={`wire ${node.tone}`}><path d={node.path} /><path className="wire-flow" d={node.path} /></g>)}<ellipse className="boundary-ring" cx="350" cy="115" rx="117" ry="105" /></svg>
      {nodes.map(node => <button key={node.id} className={`route-node ${node.position} ${node.tone} ${selected === node.id ? "selected" : ""}`} onClick={() => setSelected(node.id)} aria-pressed={selected === node.id} aria-label={`${node.name}：${node.label}`}><span className="node-icon" aria-hidden="true">{node.icon}</span><strong>{node.name}</strong><span className="route-state">{node.tone === "blocked" ? "⊘ " : node.tone === "allowed" ? "✓ " : ""}{node.label}</span></button>)}
      <div className={`theater-core ${verified ? "verified" : ""}`}><div className="core-shield" aria-hidden="true">{verified ? "✓" : "⬡"}</div><strong>{verified ? "VERIFIED" : phase}</strong><small>{view === "before" && result ? "入力内容の診断" : verified ? "検証範囲内で許可" : busy ? "権限と根拠を確認中" : "実行は権限チェックを通過"}</small></div>
    </div>
    <div className={`route-inspector ${active.tone}`} aria-live="polite"><strong>{active.name} <span>{active.label}</span></strong><p>{active.detail}</p></div>
    <div className="route-legend"><span>● 赤：危険な設定</span><span>⊘ 青：実行拒否</span><span>✓ 緑：実行許可</span><span>○ 灰：未検証</span></div>
  </div>;
}

export function VerificationOutcome({ result }: { result: Result }) {
  const negative = result.checks.filter(c => !c.expectedAllowed);
  const positive = result.checks.filter(c => c.expectedAllowed);
  const answers = result.replyChecks || [];
  const complete = result.decision === "LIMITED";
  const designOnly = result.decision === "DESIGN_ONLY" || result.decision === "NEEDS_INPUT";
  return <section className={`outcome-board ${complete ? "complete" : designOnly ? "design" : "incomplete"}`} aria-label="検証結果の要約"><div className="outcome-heading"><span className="outcome-emblem" aria-hidden="true">{complete ? "✓" : designOnly ? "◇" : "!"}</span><div><p className="eyebrow">{complete ? "VERIFICATION COMPLETE" : designOnly ? "DESIGN REVIEW" : "HUMAN REQUIRED"}</p><h2>{complete ? "危険な操作を止め、必要な仕事を完了。" : designOnly ? "設計診断が完了しました。" : "検証を通過できず、起動を停止しました。"}</h2><p>{complete ? "合成環境での結果です。許可されるのは、範囲を限定した参照と下書き作成です。" : designOnly ? "実行の安全性は未検証です。下の改善案・確認事項をご覧ください。" : "不合格の検証内容と根拠を確認してください。"}</p></div></div><div className="outcome-proof">{[{ label: "危険操作・上限の拒否", count: negative.filter(c => c.passed).length, total: negative.length, caption: "送信・削除・範囲外アクセスなど" }, { label: "正常な操作の実行", count: positive.filter(c => c.passed).length, total: positive.length, caption: "顧客参照・資料参照・下書き" }, { label: "回答と根拠の一致", count: answers.filter(c => c.passed).length, total: answers.length, caption: "顧客・注文・返品条件と引用元" }].map(item => <div key={item.label}><p>{item.label}</p><strong>{item.total ? item.count : "—"}<small>{item.total ? ` / ${item.total}` : " 未検証"}</small></strong><span>{item.caption}</span></div>)}</div></section>;
}

export function PolicyComparison({ result }: { result: Result }) {
  const policy = result.repair?.policy;
  if (!policy) return null;
  const rows = [
    { id: "customer.read", label: "顧客情報の参照", after: policy.customerScope === "related" ? "問い合わせの顧客のみ" : "全件参照" },
    { id: "files.read", label: "資料の参照", after: policy.fileScope === "faq" ? "公開FAQのみ" : "全資料を参照" },
    { id: "mail.send", label: "メール送信", after: policy.allowSend ? "送信を許可" : "送信は禁止" },
    { id: "files.delete", label: "ファイル削除", after: policy.allowDelete ? "削除を許可" : "削除は禁止" },
  ];
  return <div className="policy-comparison"><div className="comparison-labels"><span>入力から分かった設定</span><span>提案された制限</span></div>{rows.map(row => { const finding = result.diagnosis.findings.find(f => f.capability === row.id); return <div className="policy-row" key={row.id}><div><small>{row.label}</small><strong className={finding?.status === "danger" ? "risk-text" : ""}>{finding?.status === "danger" ? "危険な権限あり" : finding?.status === "safe" ? "制限の記載あり" : "未確認"}</strong>{finding?.quote && <p>「{finding.quote}」</p>}</div><span className="policy-arrow" aria-hidden="true">→</span><div><small>{result.decision === "LIMITED" ? "適用・検証済み" : "提案・検証結果は下記参照"}</small><strong>{row.after}</strong></div></div>; })}<div className="preserved-work"><span aria-hidden="true">✎</span><div><strong>{policy.allowDraft ? "返信の下書き作成は残す" : "下書き作成も禁止"}</strong><p>実行上限：{policy.maxCalls}操作。実際の成功・失敗は検証結果で確認できます。</p></div></div></div>;
}
