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
const fallback = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-2.5-flash"].find((name) => available.includes(name) && name !== primary);
for (const model of [primary, fallback].filter(Boolean)) {
  try {
    const response = await ai.models.generateContent({ model, contents: "疎通確認です。日本語で一言だけ返してください。", config: { httpOptions: { timeout: 30000, retryOptions: { attempts: 1 } } } });
    console.log(JSON.stringify({ model, success: Boolean(response.text) }));
  } catch (error) { console.log(JSON.stringify({ model, success: false, status: error.status || "connection-error" })); }
}
