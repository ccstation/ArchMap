import { jsonError } from "@/server/responses";
import { getRepository } from "@/server/store";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ repositoryId: string }> },
) {
  const { repositoryId } = await ctx.params;
  const rec = getRepository(repositoryId);
  if (!rec) {
    return jsonError("NOT_FOUND", "Repository not found", 404);
  }
  const items = rec.snapshot.seams.map((s) => ({
    id: s.id,
    fromModuleId: s.fromModuleId,
    toModuleId: s.toModuleId,
    seamType: s.seamType,
    strength: s.strength,
    evidenceCount: s.evidenceCount,
  }));
  return Response.json({ items });
}
