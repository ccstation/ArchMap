import { jsonError } from "@/server/responses";
import { getAnalysis } from "@/server/store";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ analysisId: string }> },
) {
  const { analysisId } = await ctx.params;
  const a = getAnalysis(analysisId);
  if (!a) {
    return jsonError("NOT_FOUND", "Analysis not found", 404);
  }
  return Response.json({
    id: a.id,
    repositoryId: a.repositoryId,
    status: a.status,
    progress: a.progress,
    error: a.error,
  });
}
