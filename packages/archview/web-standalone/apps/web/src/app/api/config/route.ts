import "@/server/bootstrap-load";
import { ensureSnapshotLoaded } from "@/server/bootstrap-ensure";
import { getDefaultRepositoryIdFromBootstrap } from "@/server/bootstrap-core";

/** Client-safe feature flags (no secrets). */
export async function GET() {
  ensureSnapshotLoaded();
  return Response.json({
    aiEnabled: Boolean(process.env.OPENAI_API_KEY?.trim()),
    defaultRepositoryId: getDefaultRepositoryIdFromBootstrap() ?? undefined,
  });
}
