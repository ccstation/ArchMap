import { jsonError } from "@/server/responses";
import { enrichSnapshotWithAi } from "@/server/ai";
import { getRepository, setSnapshot } from "@/server/store";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ repositoryId: string }> },
) {
  const { repositoryId } = await ctx.params;
  const rec = getRepository(repositoryId);
  if (!rec) {
    return jsonError("NOT_FOUND", "Repository not found", 404);
  }
  try {
    const next = await enrichSnapshotWithAi(rec.snapshot);
    setSnapshot(next, rec.rootPath);
    return Response.json({
      ok: true,
      generatedAt: next.ai?.generatedAt,
      moduleCount: Object.keys(next.ai?.moduleSummaries ?? {}).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("OPENAI_API_KEY")) {
      return jsonError("AI_DISABLED", msg, 503);
    }
    return jsonError("AI_FAILED", msg, 500);
  }
}
