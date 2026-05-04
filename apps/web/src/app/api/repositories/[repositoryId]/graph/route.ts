import "@/server/bootstrap-load";
import { graphFromSnapshot, jsonError } from "@/server/responses";
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
  const level = (url.searchParams.get("level") ?? "module") as
    | "module"
    | "file"
    | "element";
  if (!["module", "file", "element"].includes(level)) {
    return jsonError("INVALID_QUERY", "level must be module, file, or element", 400);
  }
  const moduleId = url.searchParams.get("moduleId") ?? undefined;
  if (moduleId && level !== "file") {
    return jsonError("INVALID_QUERY", "moduleId is only supported with level=file", 400);
  }
  if (moduleId && !rec.snapshot.modules.some((m) => m.id === moduleId)) {
    return jsonError("INVALID_QUERY", "moduleId does not exist in this snapshot", 400);
  }
  return Response.json(graphFromSnapshot(rec.snapshot, level, { moduleId }));
}
