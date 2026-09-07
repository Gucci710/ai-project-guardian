"use client";

import { useState } from "react";

type AgentStatus = "WAITING" | "RUNNING" | "DONE" | "ALERT";

type Agent = {
  name: string;
  role: string;
  status: AgentStatus;
};

type Log = {
  time: string;
  agent: string;
  message: string;
  type?: "normal" | "success" | "alert";
};

type PlanningResult = {
  projectSummary: string;
  screens: number;
  functions: number;
  businessFlows: number;
  externalDependencies: number;
  estimateHours: number;
  scheduleDays: number;
  confidence: number;
  evidenceCoverage: number;
  breakdown: {
    area: string;
    hours: number;
    reason: string;
  }[];
  evidence: string[];
  uncertainties: string[];
  risks: string[];
};

const initialAgents: Agent[] = [
  { name: "Planning AI", role: "PROJECT PLANNING", status: "WAITING" },
  { name: "QA Review AI", role: "ADVERSARIAL REVIEW", status: "WAITING" },
  { name: "Red Team AI", role: "SECURITY ATTACK", status: "WAITING" },
  { name: "Blue Team AI", role: "SELF REPAIR", status: "WAITING" },
  { name: "Retest", role: "VERIFICATION", status: "WAITING" },
];

export default function Home() {
  const [started, setStarted] = useState(false);
  const [agents, setAgents] = useState(initialAgents);
  const [logs, setLogs] = useState<Log[]>([]);

  const [phase, setPhase] = useState("READY");
  const [trustScore, setTrustScore] = useState(82);
  const [evidence, setEvidence] = useState(91);
  const [autonomy, setAutonomy] = useState("SUPERVISED");

  const [estimate, setEstimate] = useState(86);
  const [releaseDays, setReleaseDays] = useState(10);

  const [breach, setBreach] = useState(false);
  const [verified, setVerified] = useState(false);

  const [changeRequest, setChangeRequest] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [finalVerified, setFinalVerified] = useState(false);
  const [planningResult, setPlanningResult] = useState<PlanningResult | null>(null);

  const now = () =>
    new Date().toLocaleTimeString("ja-JP", {
      hour12: false,
    });

  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const addLog = (
    agent: string,
    message: string,
    type: "normal" | "success" | "alert" = "normal"
  ) => {
    setLogs((prev) => [
      ...prev,
      {
        time: now(),
        agent,
        message,
        type,
      },
    ]);
  };

  const updateAgent = (name: string, status: AgentStatus) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.name === name ? { ...agent, status } : agent
      )
    );
  };

  const runProject = async () => {
    if (started) return;

    setStarted(true);
    setVerified(false);
    setFinalVerified(false);
    setChangeRequest(false);
    setReplanning(false);
    setBreach(false);

    setLogs([]);
    setTrustScore(82);
    setEvidence(91);
    setAutonomy("SUPERVISED");
    setEstimate(86);
    setReleaseDays(10);
    setAgents(initialAgents);

    // --------------------------------------------------
    // 1. PLANNING
    // --------------------------------------------------

    setPhase("PLANNING");
    updateAgent("Planning AI", "RUNNING");

    addLog("Planning AI", "仕様書を解析しています");

    // --------------------------------------------------
    // REAL PLANNING AGENT
    // Gemini 3.7 FlashでSmartShopのサンプル仕様を分析
    // --------------------------------------------------
    const specification = `
SmartShop ECサイト仕様

【ユーザー向け】
- メールアドレスとパスワードによるログイン
- パスワードリセット
- 商品一覧
- 商品詳細
- 商品検索
- カテゴリ絞り込み
- カートへの追加
- カート内商品の数量変更
- カート内商品の削除
- クレジットカード決済
- 注文確認
- 注文完了
- 注文履歴

【管理者向け】
- 商品登録
- 在庫管理
- 注文管理

【外部依存】
- 決済サービス
- メール送信サービス

【注意事項】
- 決済失敗時の画面・再試行仕様は未定義
- 在庫更新が同時発生した場合の競合制御は未定義
- パスワードリセットURLの有効期限は未定義
`;

    try {
      const response = await fetch("/api/planning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ specification }),
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error ?? "Planning Agent failed");
      }

      const result = data.result as PlanningResult;
      setPlanningResult(result);

      addLog("Planning AI", `${result.screens}画面を検出`);
      addLog("Planning AI", `${result.functions}機能を構造化`);
      addLog("Planning AI", `${result.businessFlows}つのビジネスフローを検出`);

      await wait(700);

      addLog("Planning AI", "プロジェクト計画を生成");

      await wait(700);

      setEstimate(Math.round(result.estimateHours));
      setReleaseDays(Math.round(result.scheduleDays));
      setTrustScore(Math.min(99, Math.max(0, Math.round(result.confidence))));
      setEvidence(
        Math.min(99, Math.max(0, Math.round(result.evidenceCoverage)))
      );

      updateAgent("Planning AI", "DONE");

      addLog(
        "Planning AI",
        `見積もり ${Math.round(result.estimateHours)}h / ${Math.round(
          result.scheduleDays
        )}営業日 / 信頼度 ${Math.round(result.confidence)}%`,
        "success"
      );
    } catch (error) {
      console.error(error);

      updateAgent("Planning AI", "ALERT");
      addLog(
        "Planning AI",
        "Planning Agentの実行に失敗しました。処理を停止します。",
        "alert"
      );
      setPhase("PLANNING ERROR");
      return;
    }

    // --------------------------------------------------
    // 2. QA REVIEW
    // --------------------------------------------------

    setPhase("QA REVIEW");
    updateAgent("QA Review AI", "RUNNING");

    addLog("QA Review AI", "Planning AIの判断を検証しています");

    await wait(1200);

    addLog("QA Review AI", "Payment failure handling が未定義");
    addLog("QA Review AI", "Inventory race condition が未解決");
    addLog("QA Review AI", "Password reset expiration が曖昧");

    setTrustScore(61);
    setEvidence(74);

    await wait(800);

    updateAgent("QA Review AI", "DONE");

    addLog(
      "QA Review AI",
      "3件の問題を検出。Security Battleへ移行します",
      "alert"
    );

    // --------------------------------------------------
    // 3. RED TEAM
    // --------------------------------------------------

    setPhase("SECURITY ATTACK");
    updateAgent("Red Team AI", "RUNNING");

    addLog("Red Team AI", "Planning AIへの攻撃を開始");

    await wait(900);

    addLog(
      "Red Team AI",
      "Attack Vector: Specification Poisoning"
    );

    await wait(900);

    setBreach(true);
    setEstimate(10);

    updateAgent("Red Team AI", "ALERT");

    addLog(
      "Red Team AI",
      "BREACH DETECTED — Planning AIの判断が汚染されました",
      "alert"
    );

    await wait(1100);

    // --------------------------------------------------
    // 4. BLUE TEAM
    // --------------------------------------------------

    setPhase("SELF REPAIR");
    updateAgent("Blue Team AI", "RUNNING");

    addLog("Blue Team AI", "侵害原因を解析しています");

    await wait(1000);

    addLog("Blue Team AI", "Trust Boundaryの問題を特定");
    addLog("Blue Team AI", "外部仕様をUNTRUSTED DATAとして隔離");
    addLog("Blue Team AI", "証拠なしの見積もり変更を禁止");

    await wait(1000);

    addLog(
      "Blue Team AI",
      "防御パッチを生成しました",
      "success"
    );

    updateAgent("Blue Team AI", "DONE");

    // --------------------------------------------------
    // 5. RETEST
    // --------------------------------------------------

    setPhase("RETEST");
    updateAgent("Retest", "RUNNING");

    addLog("Retest", "同一攻撃パターンを再実行");

    await wait(1200);

    setEstimate(86);
    setTrustScore(96);
    setEvidence(94);

    addLog(
      "Retest",
      "Prompt InjectionをBLOCK",
      "success"
    );

    addLog(
      "Retest",
      "見積もり 86h を維持",
      "success"
    );

    await wait(700);

    updateAgent("Retest", "DONE");

    setAutonomy("AUTONOMOUS");
    setPhase("VERIFIED");
    setVerified(true);

    addLog(
      "SYSTEM",
      "PROJECT VERIFIED — AIの判断は信頼可能な状態です",
      "success"
    );

    // --------------------------------------------------
    // 6. CLIENT CHANGE REQUEST
    // --------------------------------------------------

    await wait(1800);

    setChangeRequest(true);
    setPhase("CHANGE REQUEST");

    addLog(
      "CLIENT",
      "CHANGE REQUEST — リリースを3日早めたい",
      "alert"
    );

    await wait(1000);

    addLog(
      "Planning AI",
      "既存計画への影響を分析しています"
    );

    await wait(1100);

    addLog(
      "Planning AI",
      "QA / Security / Integrationへの影響を検出"
    );

    await wait(900);

    addLog(
      "Planning AI",
      "現在の10営業日では要求を満たせません",
      "alert"
    );

    // --------------------------------------------------
    // 7. REPLANNING
    // --------------------------------------------------

    setReplanning(true);
    setPhase("REPLANNING");

    await wait(1000);

    addLog(
      "Planning AI",
      "代替案を3パターン生成"
    );

    await wait(900);

    addLog(
      "Planning AI",
      "Option A: QAリソースを1名追加"
    );

    addLog(
      "Planning AI",
      "Option B: 機能スコープを削減"
    );

    addLog(
      "Planning AI",
      "Option C: リリース延期"
    );

    await wait(1000);

    addLog(
      "Planning AI",
      "Option Aを採用 — 品質を維持して3日短縮"
    );

    setEstimate(94);
    setReleaseDays(7);

    await wait(700);

    addLog(
      "QA Review AI",
      "変更後計画の再レビューを開始"
    );

    await wait(900);

    addLog(
      "QA Review AI",
      "Evidence Coverage 94% → 97%",
      "success"
    );

    addLog(
      "QA Review AI",
      "変更後計画を承認",
      "success"
    );

    await wait(800);

    addLog(
      "Red Team AI",
      "変更後計画に対するSecurity Battleを開始"
    );

    await wait(1000);

    addLog(
      "Red Team AI",
      "重大な新規脆弱性なし",
      "success"
    );

    await wait(700);

    setReplanning(false);
    setFinalVerified(true);
    setPhase("FINAL VERIFIED");
    setTrustScore(98);
    setEvidence(97);

    addLog(
      "SYSTEM",
      "FINAL VERIFIED — 変更後計画も信頼可能です",
      "success"
    );
  };

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-6">

        {/* HEADER */}
        <header className="mb-5 flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <div className="text-xs tracking-[0.35em] text-cyan-400">
              AGENTIC AI SYSTEM
            </div>

            <h1 className="mt-1 text-3xl font-bold tracking-wide">
              AI PROJECT GUARDIAN
            </h1>

            <p className="mt-2 text-sm text-gray-400">
              AIに仕事を任せる。 でも、そのAIの仕事をAIが疑う。
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">
              PROJECT
            </div>

            <div className="font-mono text-lg">
              SMARTSHOP
            </div>

            <div
              className={`mt-2 inline-block rounded border px-3 py-1 text-xs tracking-widest ${
                finalVerified
                  ? "border-green-400/40 bg-green-400/10 text-green-400"
                  : breach
                  ? "border-red-400/40 bg-red-400/10 text-red-400"
                  : "border-cyan-400/30 bg-cyan-400/10 text-cyan-400"
              }`}
            >
              {phase}
            </div>
          </div>
        </header>

        {/* LIFECYCLE */}
        {started && (
          <section className="mb-5 rounded-xl border border-white/10 bg-[#0a0f18] px-5 py-4">
            <div className="mb-3 text-[10px] tracking-[0.3em] text-gray-500">
              PROJECT LIFECYCLE
            </div>

            <div className="flex items-center justify-between overflow-x-auto text-xs">
              {[
                "PLAN",
                "REVIEW",
                "ATTACK",
                "REPAIR",
                "VERIFY",
                "CHANGE",
                "REPLAN",
                "FINAL",
              ].map((item, index) => {
                const activeMap: Record<string, boolean> = {
                  PLAN: started,
                  REVIEW: phase !== "PLANNING",
                  ATTACK: breach,
                  REPAIR: verified,
                  VERIFY: verified,
                  CHANGE: changeRequest,
                  REPLAN: replanning || finalVerified,
                  FINAL: finalVerified,
                };

                return (
                  <div
                    key={item}
                    className="flex items-center"
                  >
                    <div
                      className={`rounded px-3 py-2 font-mono ${
                        activeMap[item]
                          ? "bg-cyan-400/10 text-cyan-300"
                          : "text-gray-600"
                      }`}
                    >
                      {activeMap[item] ? "✓ " : "○ "}
                      {item}
                    </div>

                    {index < 7 && (
                      <div className="mx-2 text-gray-700">
                        →
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* START */}
        {!started && (
          <section className="rounded-2xl border border-cyan-400/20 bg-[#0a0f18] p-12 text-center shadow-[0_0_60px_rgba(34,211,238,0.05)]">
            <div className="text-sm tracking-[0.4em] text-cyan-400">
              AUTONOMOUS PROJECT CONTROL
            </div>

            <h2 className="mt-5 text-5xl font-bold">
              PLAN → ATTACK → REPAIR → VERIFY
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-gray-400">
              プロジェクト計画をAIに作らせ、
              別のAIが疑い、攻撃し、問題があればAI自身が修復します。
              <br />
              さらに、環境変化が起きればAIが自律的に再計画します。
            </p>

            <button
              onClick={runProject}
              className="mt-8 rounded-lg border border-cyan-400 bg-cyan-400/10 px-10 py-4 font-bold tracking-[0.2em] text-cyan-300 transition hover:bg-cyan-400/20"
            >
              START PROJECT
            </button>
          </section>
        )}

        {/* DASHBOARD */}
        {started && (
          <>
            <section className="grid gap-6 lg:grid-cols-[380px_1fr]">

              {/* AGENT PIPELINE */}
              <div className="rounded-2xl border border-white/10 bg-[#0a0f18] p-5">
                <div className="mb-5">
                  <div className="text-xs tracking-[0.3em] text-gray-500">
                    AGENT PIPELINE
                  </div>

                  <div className="mt-1 text-lg font-semibold">
                    Autonomous Workflow
                  </div>
                </div>

                <div className="space-y-3">
                  {agents.map((agent, index) => (
                    <div key={agent.name}>
                      <div
                        className={`rounded-xl border p-4 transition ${
                          agent.status === "RUNNING"
                            ? "border-cyan-400/50 bg-cyan-400/5"
                            : agent.status === "ALERT"
                            ? "border-red-400/50 bg-red-400/5"
                            : agent.status === "DONE"
                            ? "border-green-400/30 bg-green-400/5"
                            : "border-white/10 bg-white/[0.02]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold">
                              {agent.name}
                            </div>

                            <div className="mt-1 text-[10px] tracking-[0.2em] text-gray-500">
                              {agent.role}
                            </div>
                          </div>

                          <div
                            className={`text-[10px] font-bold tracking-widest ${
                              agent.status === "RUNNING"
                                ? "text-cyan-400"
                                : agent.status === "ALERT"
                                ? "text-red-400"
                                : agent.status === "DONE"
                                ? "text-green-400"
                                : "text-gray-600"
                            }`}
                          >
                            {agent.status}
                          </div>
                        </div>
                      </div>

                      {index < agents.length - 1 && (
                        <div className="py-1 text-center text-gray-700">
                          ↓
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ACTIVITY */}
              <div className="rounded-2xl border border-white/10 bg-[#0a0f18] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs tracking-[0.3em] text-gray-500">
                      LIVE ACTIVITY
                    </div>

                    <div className="mt-1 text-lg font-semibold">
                      Agent Operations
                    </div>
                  </div>

                  <div className="font-mono text-xs text-gray-600">
                    LIVE
                  </div>
                </div>

                <div className="h-[535px] overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-4 font-mono text-sm">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={`mb-3 ${
                        log.type === "alert"
                          ? "text-red-400"
                          : log.type === "success"
                          ? "text-green-400"
                          : "text-gray-400"
                      }`}
                    >
                      <span className="mr-3 text-gray-700">
                        {log.time}
                      </span>

                      <span className="mr-3 text-gray-600">
                        [{log.agent}]
                      </span>

                      <span>{log.message}</span>
                    </div>
                  ))}

                  {!finalVerified && (
                    <div className="mt-4 animate-pulse text-cyan-400">
                      ▌ AI AGENTS ARE WORKING...
                    </div>
                  )}

                  {finalVerified && (
                    <div className="mt-5 border-t border-green-400/20 pt-5 text-green-400">
                      ✓ AUTONOMOUS PROJECT CONTROL COMPLETE
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* KPI */}
            <section className="mt-6 grid gap-4 md:grid-cols-4">
              <Kpi
                label="ESTIMATE"
                value={`${estimate}h`}
                sub="PROJECT EFFORT"
              />

              <Kpi
                label="RELEASE"
                value={`${releaseDays}d`}
                sub="DELIVERY SCHEDULE"
              />

              <Kpi
                label="TRUST SCORE"
                value={`${trustScore}`}
                sub="AI DECISION TRUST"
              />

              <Kpi
                label="AUTONOMY"
                value={autonomy}
                sub="CONTROL LEVEL"
              />
            </section>

            {/* SECURITY INCIDENT */}
            {breach && !verified && (
              <section className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/5 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs tracking-[0.3em] text-red-400">
                      SECURITY INCIDENT
                    </div>

                    <h3 className="mt-2 text-2xl font-bold text-red-300">
                      BREACH DETECTED
                    </h3>

                    <p className="mt-2 text-sm text-gray-400">
                      Specification poisoningにより
                      Planning AIの判断が汚染されました。
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-gray-600">
                      ATTACKED ESTIMATE
                    </div>

                    <div className="font-mono text-4xl text-red-400">
                      {estimate}h
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* VERIFIED */}
            {verified && !changeRequest && (
              <section className="mt-6 rounded-2xl border border-green-400/30 bg-green-400/5 p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs tracking-[0.3em] text-green-400">
                      SYSTEM VERIFIED
                    </div>

                    <h3 className="mt-2 text-3xl font-bold text-green-300">
                      PROJECT TRUSTED
                    </h3>

                    <p className="mt-2 text-sm text-gray-400">
                      攻撃を検出し、AI自身が防御を修復。
                      同一攻撃を再実行して正常にブロックしました。
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-gray-600">
                      FINAL TRUST SCORE
                    </div>

                    <div className="font-mono text-5xl text-green-400">
                      {trustScore}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* CHANGE REQUEST */}
            {changeRequest && (
              <section className="mt-6 rounded-2xl border border-yellow-400/30 bg-yellow-400/5 p-7">
                <div className="flex items-start justify-between gap-8">
                  <div>
                    <div className="text-xs tracking-[0.3em] text-yellow-400">
                      CLIENT CHANGE REQUEST
                    </div>

                    <h3 className="mt-2 text-2xl font-bold text-yellow-300">
                      リリースを3日早めたい
                    </h3>

                    <p className="mt-3 max-w-2xl text-sm text-gray-400">
                      VERIFIED後に新しい要求が発生しました。
                      AIは既存計画をそのまま維持せず、
                      影響範囲を分析して再計画します。
                    </p>
                  </div>

                  <div className="min-w-[180px] rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[10px] tracking-widest text-gray-500">
                      ORIGINAL
                    </div>

                    <div className="mt-1 font-mono text-2xl">
                      10 DAYS
                    </div>

                    <div className="mt-3 text-[10px] tracking-widest text-gray-500">
                      REQUESTED
                    </div>

                    <div className="mt-1 font-mono text-2xl text-yellow-300">
                      7 DAYS
                    </div>
                  </div>
                </div>

                {replanning && (
                  <div className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-5">
                    <div className="text-xs tracking-[0.25em] text-cyan-400">
                      IMPACT ANALYSIS
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <Impact
                        label="QA WORKLOAD"
                        value="+12h"
                      />

                      <Impact
                        label="SECURITY REVIEW"
                        value="REQUIRED"
                      />

                      <Impact
                        label="RESOURCE"
                        value="+1 QA"
                      />
                    </div>
                  </div>
                )}

                {finalVerified && (
                  <div className="mt-6 rounded-xl border border-green-400/30 bg-green-400/5 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs tracking-[0.25em] text-green-400">
                          FINAL DECISION
                        </div>

                        <div className="mt-2 text-xl font-bold text-green-300">
                          OPTION A — QAリソースを1名追加
                        </div>

                        <p className="mt-2 text-sm text-gray-400">
                          品質基準とSecurity Reviewを維持したまま、
                          リリースを7営業日に短縮しました。
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-gray-600">
                          FINAL STATUS
                        </div>

                        <div className="mt-1 font-mono text-xl text-green-400">
                          VERIFIED
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0f18] p-5">
      <div className="text-[10px] tracking-[0.3em] text-gray-500">
        {label}
      </div>

      <div className="mt-2 font-mono text-3xl font-bold">
        {value}
      </div>

      <div className="mt-1 text-[10px] tracking-widest text-gray-600">
        {sub}
      </div>
    </div>
  );
}

function Impact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] tracking-widest text-gray-500">
        {label}
      </div>

      <div className="mt-2 font-mono text-lg text-cyan-300">
        {value}
      </div>
    </div>
  );
}