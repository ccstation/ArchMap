import { jsonError, moduleDetail } from "@/server/responses";
import { findRepositoryIdForModule, getRepository } from "@/server/store";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ moduleId: string }> },
) {
  const { moduleId } = await ctx.params;
  const rid = findRepositoryIdForModule(moduleId);
  if (!rid) {
    return jsonError("NOT_FOUND", "Module not found", 404);
  }
  const rec = getRepository(rid);
  if (!rec) {
    return jsonError("NOT_FOUND", "Repository not found", 404);
  }
  const detail = moduleDetail(rec.snapshot, moduleId, rec.rootPath);
  if (!detail) {
    return jsonError("NOT_FOUND", "Module not found", 404);
  }
  return Response.json(detail);
}
