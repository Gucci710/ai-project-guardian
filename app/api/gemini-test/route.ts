import { GoogleGenAI } from "@google/genai";

export async function GET() {
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: "AI Project Guardianへようこそ。10文字程度で一言返してください。",
    });

    return Response.json({
      success: true,
      message: response.text,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        success: false,
        error: "Gemini APIの呼び出しに失敗しました。",
      },
      { status: 500 }
    );
  }
}