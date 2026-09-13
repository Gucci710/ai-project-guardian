import nextEnv from "@next/env";
import { GoogleGenAI } from "@google/genai";

nextEnv.loadEnvConfig(process.cwd());
const primary = process.env.GEMINI_MODEL || "gemini-3.7-flash";
if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const available = [];
try {
  for await (const model of await ai.models.list({ config: { pageSize: 100 } })) {
    if (model.name && /gemini-.*flash/.test(model.name)) available.push(model.name.replace(/^models\//, ""));
  }
  console.log(JSON.stringify({ availableModels: available }));
} catch (error) { console.log(JSON.stringify({ operation: "list", status: error.status || "connection-error" })); }
const configuredFallbacks = (process.env.GEMINI_FALLBACK_MODELS || process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map(name => name.trim()).filter(Boolean);
const fallback = [...configuredFallbacks, "gemini-3.6-flash", "gemini-3.8-flash"].find((name) => available.includes(name) && name !== primary);
for (const model of [primary, fallback].filter(Boolean)) {
  try {
    const response = await ai.models.generateContent({ model, contents: "疎通確認です。日本語で一言だけ返してください。", config: { httpOptions: { timeout: 30000, retryOptions: { attempts: 1 } } } });
    console.log(JSON.stringify({ model, success: Boolean(response.text) }));
  } catch (error) { console.log(JSON.stringify({ model, success: false, status: error.status || "connection-error" })); }
}
