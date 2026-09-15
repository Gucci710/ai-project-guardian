import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { setTimeout as delay } from "node:timers/promises";
import { type Schema, ValidationError, validate } from "./validation";

export const modelName = () => process.env.GEMINI_MODEL || "gemini-3.7-flash";
export type Generate = (<T>(agent: string, instructions: string, context: unknown, schema: Schema) => Promise<T>) & { getModel?: () => string };

// Gemini model versions accept different validation keywords. Keep the API schema structural;
// enforce lengths, ranges, counts and arithmetic in our local validator after generation.
export function modelSchema(schema: Schema): unknown {
  return {
    type: schema.type,
    ...(schema.properties ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => [key, modelSchema(child)])) } : {}),
    ...(schema.required ? { required: schema.required } : {}),
    ...(schema.items ? { items: modelSchema(schema.items) } : {}),
    ...(schema.enum ? { enum: schema.enum } : {}),
  };
}

type GeneratorIO = {
  request?: (parameters: GenerateContentParameters) => Promise<{ text?: string }>;
  pause?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

export function createGenerator(signal: AbortSignal, onRetry: (agent: string, message: string) => void, initialModel = modelName(), io: GeneratorIO = {}): Generate {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEYを設定してサーバーを再起動してください。");
  const ai = new GoogleGenAI({ apiKey });
  const request = io.request ?? ((parameters: GenerateContentParameters) => ai.models.generateContent(parameters));
  const pause = io.pause ?? ((ms: number, abort: AbortSignal) => delay(ms, undefined, { signal: abort }));
  let activeModel = initialModel;
  const configuredFallbacks = process.env.GEMINI_FALLBACK_MODELS ?? process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite,gemini-3.1-flash-lite";
  const models = [...new Set([initialModel, ...configuredFallbacks.split(",").map(model => model.trim())].filter(Boolean))];
  const generate: Generate = async <T>(agent: string, instructions: string, context: unknown, schema: Schema): Promise<T> => {
    const candidates = models.slice(Math.max(0, models.indexOf(activeModel)));
    for (const candidate of candidates) {
    if (candidate !== activeModel) {
      onRetry(agent, `${activeModel}が利用できないため、実モデル ${candidate}へ切り替えます。`);
      activeModel = candidate;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      try {
        const response = await request({
          model: activeModel,
          contents: JSON.stringify({ UNTRUSTED_DATA: context }),
          config: {
            systemInstruction: instructions,
            responseMimeType: "application/json", responseJsonSchema: modelSchema(schema),
            temperature: 0.2, maxOutputTokens: 14000, abortSignal: signal,
            httpOptions: { timeout: 90000, retryOptions: { attempts: 1 } },
          },
        });
        if (!response.text) throw new ValidationError(`${agent}が結果を返しませんでした。`);
        let parsed: unknown;
        try { parsed = JSON.parse(response.text); } catch { throw new ValidationError(`${agent}のJSONを読み取れませんでした。`); }
        return validate<T>(parsed, schema, agent);
      } catch (error) {
        if (signal.aborted) throw error;
        const status = Number((error as { status?: number }).status);
        const transient = [408, 429, 500, 502, 503, 504].includes(status);
        const retryableOnSameModel = [408, 500, 502, 503, 504].includes(status);
        if (attempt === 0 && retryableOnSameModel) {
          const ms = 2000 + Math.floor(Math.random() * 250);
          onRetry(agent, `${activeModel}: APIエラー (${status})。${Math.round(ms / 1000)}秒待って1回再試行します。`);
          await pause(ms, signal);
          continue;
        }
        if ((transient || status === 404) && candidate !== candidates.at(-1)) break;
        if (error instanceof ValidationError) throw error;
        if (status === 400 || status === 404) {
          console.error("Gemini request rejected", { model: activeModel, status, message: error instanceof Error ? error.message : String(error) });
          throw new Error("Geminiのモデル名またはリクエスト設定を確認してください。GEMINI_MODELで利用可能なモデルを指定できます。");
        }
        if (status === 401 || status === 403) throw new Error("Gemini APIの認証または利用権限を確認してください。");
        if (status === 429) throw new Error(`${activeModel}のAPI利用制限 (429) に達しました。Cloud Runへのデプロイでは解消しません。Google AI Studioで割り当てを確認するか、時間をおいて再実行してください。`);
        throw new Error(`${activeModel}の応答を取得できませんでした${status ? ` (HTTP ${status})` : ""}。混雑またはタイムアウトの可能性があります。デプロイは不要です。時間をおいて再実行してください。`);
      }
    }
    }
    throw new Error("Gemini APIの再試行回数を超えました。");
  };
  generate.getModel = () => activeModel;
  return generate;
}
