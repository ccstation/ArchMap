import "server-only";
import fs from "node:fs";
import { snapshotSchema } from "@archmap/graph-model";
import { registerSnapshotLoader } from "@/server/bootstrap-ensure";
import { setSnapshot } from "@/server/store";
import { setBootstrappedRepositoryId } from "@/server/bootstrap-core";

export function loadSnapshotFromFile(absPath: string): void {
  const raw = fs.readFileSync(absPath, "utf8");
  const json: unknown = JSON.parse(raw);
  const parsed = snapshotSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid snapshot at ${absPath}: ${msg}`);
  }
  const snapshot = parsed.data;
  setSnapshot(snapshot, snapshot.repository.path);
  setBootstrappedRepositoryId(snapshot.repository.id);
}

export function tryLoadSnapshotFromEnv(): void {
  const p = process.env.ARCHVIEW_SNAPSHOT_PATH?.trim();
  if (!p) return;
  loadSnapshotFromFile(p);
}

let loadedFromEnv = false;
function loadFromEnvOnce(): void {
  if (loadedFromEnv) return;
  loadedFromEnv = true;
  tryLoadSnapshotFromEnv();
}

registerSnapshotLoader(loadFromEnvOnce);
