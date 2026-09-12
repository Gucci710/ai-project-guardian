import { type ProjectInput, inputSchema, validate } from "@/lib/guardian/contracts";
import { createGenerator } from "@/lib/guardian/gemini";
import { errorResponse, readBody } from "@/lib/guardian/http";
import { generatePlan } from "@/lib/guardian/workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const input = validate<ProjectInput>({ projectName: body.projectName ?? "SmartShop", specification: body.specification, developmentMembers: body.developmentMembers ?? 3, qaMembers: body.qaMembers ?? 2 }, inputSchema);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(280000)]);
    const result = await generatePlan(input, createGenerator(signal, () => {}));
    return Response.json({ success: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
