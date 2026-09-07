import { GoogleGenAI } from "@google/genai";

export async function POST(request: Request) {
  try {
    const { specification } = await request.json();

    if (!specification) {
      return Response.json(
        { success: false, error: "仕様書がありません。" },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const prompt = `
あなたは「AI Project Guardian」のPlanning Agentです。

あなたの仕事は、与えられたプロジェクト仕様を分析し、
プロジェクト計画と工数見積もりを作成することです。

必ず以下を分析してください。

1. 画面数
2. 機能数
3. ビジネスフロー数
4. 外部サービス・外部依存
5. 必要な作業
6. 工数見積もり
7. スケジュール
8. 見積もりの根拠
9. 不確実な点
10. 信頼度

重要:
- 仕様に書かれていないことを事実として扱わない
- 推測した内容は「推測」と明示する
- 工数だけでなく「なぜその工数なのか」を説明する
- 不明点があれば信頼度を下げる
- 結果はJSONのみで返す

以下の形式で返してください。

{
  "projectSummary": "プロジェクト概要",
  "screens": 0,
  "functions": 0,
  "businessFlows": 0,
  "externalDependencies": 0,
  "estimateHours": 0,
  "scheduleDays": 0,
  "confidence": 0,
  "evidenceCoverage": 0,
  "breakdown": [
    {
      "area": "作業領域",
      "hours": 0,
      "reason": "工数の根拠"
    }
  ],
  "evidence": [
    "仕様から確認できた根拠"
  ],
  "uncertainties": [
    "不確実な点"
  ],
  "risks": [
    "計画上のリスク"
  ]
}

【プロジェクト仕様】
${specification}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
    });

    const text = response.text ?? "";

    // GeminiがJSON以外の文字を返した場合に備えて、
    // JSON部分だけを取り出します。
    const jsonText = text
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const result = JSON.parse(jsonText);

    return Response.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Planning Agent error:", error);

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}