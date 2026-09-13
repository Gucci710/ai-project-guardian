import type { Result } from "./contracts";

export function launchVerdict(result: Result | null, busy = false, error = "") {
  if (busy) return { code: "CHECKING", tone: "checking", title: "判定中", reason: "設計と権限を確認しています。", next: "結果が出るまでお待ちください。" };
  if (error) return { code: "PEND", tone: "pending", title: "判定保留", reason: "審査を完了できませんでした。起動許可はありません。", next: "下のエラー内容を確認して再実行してください。" };
  if (!result) return { code: "READY", tone: "ready", title: "未判定", reason: "起動前の安全確認を始めましょう。", next: "任せたい仕事を入力し、設計診断を開始してください。" };
  if (result.decision === "LIMITED") return { code: "GO", tone: "go", title: "起動可（制限付き）", reason: "修正後の権限で、危険操作の拒否と正常業務の成功を確認しました。", next: "Guardian内の合成環境で下書き作成を試せます。外部送信・削除は許可されません。" };
  if (result.decision === "BLOCKED") return { code: "NO GO", tone: "no-go", title: "起動不可", reason: "権限ルールまたは正常業務の検証に不合格があります。", next: "不合格の項目と修正案を確認し、説明を変更して再診断してください。" };
  if (result.decision === "DESIGN_ONLY") return { code: "PEND", tone: "pending", title: "判定保留", reason: "この業務を実際に動かして検証する環境が、Guardianにまだありません。", next: "設計の指摘は確認できます。起動判断には対象業務の実行環境と検証が必要です。説明の追記だけでは解除できません。" };
  return { code: "PEND", tone: "pending", title: "判定保留", reason: result.decision === "NEEDS_INPUT" ? "権限や扱う情報が未確認のため、起動判断に必要な情報が不足しています。" : "実行の安全性を確認できていません。", next: "確認事項に回答し、説明を補って再診断してください。" };
}
