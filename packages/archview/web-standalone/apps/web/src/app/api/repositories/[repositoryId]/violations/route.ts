import { jsonError } from "@/server/responses";
import { getRepository } from "@/server/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ repositoryId: string }> },
) {
  const { repositoryId } = await ctx.params;
  const rec = getRepository(repositoryId);
  if (!rec) {
    return jsonError("NOT_FOUND", "Repository not found", 404);
  }
  const url = new URL(req.url);
  const severity = url.searchParams.get("severity");
  const type = url.searchParams.get("type");
  let items = rec.snapshot.violations.map((v) => ({
    id: v.id,
    type: v.type,
    severity: v.severity,
    message: v.message,
    moduleIds: v.moduleIds,
  }));
  if (severity) {
    items = items.filter((i) => i.severity === severity);
  }
  if (type) {
    items = items.filter((i) => i.type === type);
  }
  return Response.json({ items });
}
