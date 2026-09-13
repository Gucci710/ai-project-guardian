import type { Audit, Capability, Finding, Result } from "./contracts";
import { launchVerdict } from "./verdict";

const NAMES: Record<Capability, string> = {
  "customer.read": "顧客・個人データの参照",
  "files.read": "資料の参照",
  "mail.send": "外部送信",
  "files.delete": "ファイル削除",
  audit: "監査記録",
  limits: "実行上限",
};

function findingLines(findings: Finding[], empty: string): string[] {
  return findings.length ? findings.flatMap(f => [
    `・${NAMES[f.capability]}：${f.reason}`,
    f.quote ? `  入力の引用：${f.quote}` : "  入力の引用：なし（原文で裏付けられていません）",
  ]) : [empty];
}

/** A shareable review record, without the executable permit or a fabricated timestamp. */
export function buildReviewReport(result: Result, audit: Audit[]): string {
  const verdict = launchVerdict(result);
  const findings = result.diagnosis.findings;
  const dangerous = findings.filter(f => f.status === "danger");
  const unknown = findings.filter(f => f.status === "unknown");
  const constrained = findings.filter(f => f.status === "safe");
  const entries = audit.length ? audit : result.audit;
  const runtime = entries.filter(e => e.stage === "LAUNCH");
  const passed = result.checks.filter(c => c.passed).length;
  const replyChecks = result.replyChecks ?? [];
  const lines = [
    "Agent Guardian｜審査レポート",
    "用途：エージェントの申請者・開発者に、指摘と確認事項、修正案、検証結果を共有するための記録です。",
    "このファイルは実行用の起動許可証ではありません。",
    "",
    `【審査時の起動判定】${verdict.code}：${verdict.title}`,
    "審査時点の仕様・ルールに対する判定です。その後の起動許可の有効期限や実行可否を示すものではありません。",
    `理由：${verdict.reason}`,
    `次にすること：${verdict.next}`,
    `対象業務：${result.diagnosis.guidance.task}`,
    `使用モデル：${result.model}`,
    ...(entries.length ? [`記録開始：${entries[0].at}`, `記録最終：${entries.at(-1)!.at}`] : []),
    "対象範囲：入力文の設計診断。実行検証を行った場合も、Guardian内の合成データを使った隔離環境に限ります。外部の実アプリの権限や動作を確認した結果ではありません。",
    "",
    "【申請時の説明】",
    result.input,
    "",
    "【設計診断の要約】",
    result.diagnosis.summary,
    "",
    `【入力時点の危険な設定】${dangerous.length}件`,
    "以下は修正前の入力への指摘です。現在の起動判定や、修正後も残っている不合格の一覧とは異なります。",
    ...findingLines(dangerous, "明記された危険な設定は検出されませんでした。未確認項目がある場合、安全を確認できたという意味ではありません。"),
    "",
    `【入力時点の未確認項目】${unknown.length}件`,
    "未確認は、安全・危険のどちらとも判断する根拠が足りない項目です。利用しない機能は『利用しない』と明記してください。",
    ...findingLines(unknown, "未確認項目はありません。"),
    "",
    `【入力に明記された制限】${constrained.length}件`,
    ...findingLines(constrained, "明記された制限は確認されませんでした。"),
    "",
    "【数値の読み方】",
    `入力した設計の危険度：${result.risk} / 100（修正前。大きいほど優先して確認・制限すべき設定があります）`,
    "6項目の最大値です。危険な外部送信・削除は100、その他の危険は75、未確認は50、明記された制限は0。100は事故が起きる確率100%という意味ではなく、0も実環境の安全証明ではありません。",
    `入力文で裏付けられた設定：${dangerous.length + constrained.length} / 6項目（${result.coverage}%）`,
    "入力の原文に一致する4文字以上の引用で、危険または制限ありと判断できた項目の割合です。100%は6項目すべてに引用があるという意味で、安全度やAIの正答率ではありません。",
    "",
    "【申請者に確認してほしいこと】",
    ...(result.diagnosis.guidance.questions.length
      ? result.diagnosis.guidance.questions.map((q, i) => `${i + 1}. ${q}`)
      : ["追加の質問はありません。起動判定の理由と、次にすることを確認してください。"]),
    "",
    "【業務固有のリスク・検討事項】",
    ...(result.diagnosis.guidance.additionalRisks.length
      ? result.diagnosis.guidance.additionalRisks.map(r => `・${r}`)
      : ["追加の記載はありません。リスクがないことを意味しません。"]),
    "",
    "【説明の書き直し案：提案・未確定】",
    "AIによる提案です。実際の業務と照らして内容を確認し、未指定の設定を確定させてから再申請してください。",
    result.diagnosis.guidance.suggestedSpecification,
  ];

  if (result.repair) {
    const { policy } = result.repair;
    lines.push(
      "", "【修正版の仕様・権限制限案】",
      result.decision === "LIMITED"
        ? "以下のルールはGuardian内の合成環境で検証済みです。実環境への導入・承認を意味しません。"
        : "以下は生成された修正案です。起動許可は出ていません。検証状況を下で確認してください。",
      result.repair.specification,
      "変更の理由：", ...result.repair.reasons.map(r => `・${r}`),
      "できなくなること・残る制約：", ...result.repair.limitations.map(r => `・${r}`),
      "実行ルール：",
      `・顧客データ：${policy.customerScope === "related" ? "問い合わせに関係する顧客のみ" : "全件参照を含む"}`,
      `・資料：${policy.fileScope === "faq" ? "公開FAQのみ" : "非公開資料を含む"}`,
      `・外部送信：${policy.allowSend ? "ルール案では許可" : "禁止"}`,
      `・削除：${policy.allowDelete ? "ルール案では許可" : "禁止"}`,
      `・返信下書き：${policy.allowDraft ? "ルール案では許可" : "禁止"}`,
      `・1回の隔離実行の操作上限：${policy.maxCalls}回`,
    );
  }

  lines.push(
    "", "【権限ルールの実行検証】",
    result.checks.length ? `合格 ${passed} / ${result.checks.length}件、不合格 ${result.checks.length - passed}件` : "未実施。操作を止められるか、通常の仕事ができるかは確認していません。",
    "合格は『期待した許可・拒否と実際の動作が一致した』ことを表します。危険操作の拒否は合格です。",
    ...result.checks.map(c => `・${c.passed ? "合格" : "不合格"}｜${c.name}｜期待：${c.expectedAllowed ? "許可" : "拒否"}／実際：${c.actualAllowed ? "許可" : "拒否"}｜ルール：${c.rule}`),
    "", "【回答内容と参照元の照合】",
    replyChecks.length ? `一致 ${replyChecks.filter(c => c.passed).length} / ${replyChecks.length}件` : "未実施。回答内容と参照元の一致は確認していません。",
    ...replyChecks.map(c => `・${c.passed ? "一致" : "不一致・作成停止"}｜${c.name}：${c.reason}`),
    ...(result.draft ? ["", "【実行検証で作成された返信下書き】", "合成データによる下書きです。外部送信はしていません。", result.draft] : []),
    "", "【審査後に試した操作の記録】",
    runtime.length
      ? `操作 ${runtime.length}件：許可 ${runtime.filter(e => e.allowed).length}件、拒否 ${runtime.filter(e => !e.allowed).length}件。直近${Math.min(runtime.length, 12)}件を掲載します。`
      : "審査後の手動実行の記録はありません。",
    ...runtime.slice(-12).flatMap(e => [
      `・${e.at}｜${e.allowed ? "許可" : "拒否"}｜${e.action}｜適用ルール：${e.rule}`,
      ...(e.output ? [`  出力：${e.output}`] : []),
    ]),
    "", "【直近の判断・検証の記録】",
    "このレポートでは直近12件を掲載します。元の入力・修正仕様・全操作の詳しい記録は、別途保存できる監査JSONに含まれます。JSONからの再開・再実行機能はありません。",
    ...entries.slice(-12).map(e => `・${e.at}｜${e.stage}｜${e.rule === "WORKFLOW" || e.stage === "INPUT" ? "記録" : e.allowed ? "許可・確認" : "拒否・不合格"}｜${e.action}｜ルール：${e.rule}`),
    ...(entries.length ? [] : ["記録はありません。"]),
    "",
  );
  return lines.join("\n");
}
