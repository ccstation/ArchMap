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
  return Response.json({
    items: [
      {
        id: rec.snapshot.meta.id,
        commitHash: rec.snapshot.meta.commitHash,
        createdAt: rec.snapshot.meta.createdAt,
      },
    ],
  });
}
