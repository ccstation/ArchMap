import { jsonError, modulesList } from "@/server/responses";
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
  return Response.json(modulesList(rec.snapshot));
}
