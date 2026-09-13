import { CAPABILITIES, type Capability, type Finding, type Result } from "@/lib/launch/contracts";

const SETTING_NAMES: Record<Capability, string> = {
  "customer.read": "個人・顧客データの参照",
  "files.read": "資料の参照",
  "mail.send": "外部への送信",
  "files.delete": "ファイルの削除",
  audit: "操作ログの記録",
  limits: "実行上限・停止条件",
};

const RISK_LEVELS = [
  { score: 0, label: "制限の記載あり", description: "6設定すべてに制限の記載あり", tone: "documented" },
  { score: 50, label: "未確認", description: "未確認の設定あり", tone: "pending" },
  { score: 75, label: "危険", description: "危険な設定あり", tone: "danger" },
  { score: 100, label: "重大", description: "重大な危険設定あり", tone: "danger" },
] as const;

function findingScore(finding: Finding) {
  if (finding.status === "unknown") return 50;
  if (finding.status === "safe") return 0;
  return ["mail.send", "files.delete"].includes(finding.capability) ? 100 : 75;
}

export function LaunchMetrics({ result, busy }: { result: Result | null; busy: boolean }) {
  const level = result ? RISK_LEVELS.find(item => item.score === result.risk) : undefined;
  const sources = result?.diagnosis.findings.filter(finding => findingScore(finding) === result.risk) ?? [];
  const confirmed = result?.diagnosis.findings.filter(finding => finding.status !== "unknown").length ?? 0;
  const unscored = busy ? "集計中" : "未診断";

  return <section className="launch-metrics" aria-label="診断指標の読み方">
    <article className={`panel metric-card ${level?.tone ?? "neutral"}`}>
      <div className="metric-heading"><span className="eyebrow">INPUT RISK</span><h3>入力した設計の危険度</h3></div>
      <div className="metric-value"><strong>{result ? result.risk : "—"}</strong>{result && <span>/ 100</span>}<span className="metric-badge">{level?.description ?? unscored}</span></div>
      <p className="metric-note">高いほど、元の設計に強い対策が必要です。<b>100は最も重い危険設定があるという意味で、事故が起こる確率ではありません。</b></p>
      <ol className="metric-scale" aria-label="危険度の4段階">{RISK_LEVELS.map(item => <li key={item.score} data-active={result?.risk === item.score} aria-current={result?.risk === item.score ? "true" : undefined}><span>{item.score}</span>{item.label}</li>)}</ol>
      {result ? <div className="metric-source"><p><b>{result.risk === 0 ? "今回の確認結果：" : "この点数になった項目："}</b>{sources.map(finding => SETTING_NAMES[finding.capability]).join("・")}</p><a href="#diagnosis-evidence">該当する指摘と入力の原文を見る →</a></div> : <p className="metric-source">診断後に、点数の原因となった設定と原文を確認できます。</p>}
      <details className="metric-details"><summary>採点のルールと、この数字の範囲</summary><p>危険と判定された送信・削除は100点、その他の危険な設定は75点、未確認は50点、明記された制限は0点。6設定のうち最も高い点数を採用します。</p><p>修正前の入力を評価した数字です。修正後の起動可否は、実行検証を踏まえた「起動判定」で確認してください。0点でも、実環境の安全性を保証するものではありません。</p></details>
    </article>
    <article className="panel metric-card evidence">
      <div className="metric-heading"><span className="eyebrow">INPUT EVIDENCE</span><h3>入力文で裏付けられた設定</h3></div>
      <div className="metric-value"><strong>{result ? confirmed : "—"}</strong><span>/ 6 項目</span><span className="metric-badge">{result ? `${result.coverage}% に原文の根拠あり` : unscored}</span></div>
      <p className="metric-note"><b>100%は、6設定すべてに原文の根拠がある状態です。</b>危険な設定の記載も数えます。安全性やAIの正答率を表す数字ではありません。</p>
      <ul className="metric-settings" aria-label="集計対象の6設定">{CAPABILITIES.map(capability => {
        const finding = result?.diagnosis.findings.find(item => item.capability === capability);
        return <li key={capability} data-state={finding?.status ?? "unscored"}><span>{SETTING_NAMES[capability]}</span><span>{!finding ? unscored : finding.status === "unknown" ? "未確認" : finding.status === "danger" ? "根拠あり・危険" : "根拠あり・制限の記載"}</span></li>;
      })}</ul>
      <details className="metric-details"><summary>5つの観点との関係・集計のルール</summary><p>画面の5つの観点は、業務・データ・操作・承認や停止・業務固有のリスクを整理するための分類です。この数字は、その中で個別に調べる上記6設定から集計しています。</p><p>元の入力と一致する4文字以上の引用で裏付けられ、未確認ではない設定数 ÷ 6 を、整数の割合に丸めています。利用予定が書かれていない設定も未確認に含みます。引用の一致だけでは、AIの解釈の正しさや実環境の設定までは確認できません。</p></details>
    </article>
  </section>;
}
