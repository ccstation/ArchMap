import type { Snapshot } from "@archmap/graph-model";
import { ensureSnapshotLoaded } from "@/server/bootstrap-ensure";

export type AnalysisStatus = "queued" | "running" | "completed" | "failed";

export interface AnalysisRecord {
  id: string;
  repositoryId: string;
  status: AnalysisStatus;
  progress?: { stage: string; percent: number };
  error?: string;
  snapshotId?: string;
}

interface RepoRecord {
  snapshot: Snapshot;
  rootPath: string;
}

const globalStore = globalThis as unknown as {
  __archmapRepos?: Map<string, RepoRecord>;
  __archmapAnalyses?: Map<string, AnalysisRecord>;
  __archmapModuleToRepo?: Map<string, string>;
};

function repos(): Map<string, RepoRecord> {
  if (!globalStore.__archmapRepos) globalStore.__archmapRepos = new Map();
  return globalStore.__archmapRepos;
}

function analyses(): Map<string, AnalysisRecord> {
  if (!globalStore.__archmapAnalyses) globalStore.__archmapAnalyses = new Map();
  return globalStore.__archmapAnalyses;
}

function moduleToRepo(): Map<string, string> {
  if (!globalStore.__archmapModuleToRepo) globalStore.__archmapModuleToRepo = new Map();
  return globalStore.__archmapModuleToRepo;
}

export function setSnapshot(snapshot: Snapshot, rootPath: string): void {
  const rid = snapshot.repository.id;
  const prev = repos().get(rid);
  if (prev) {
    for (const m of prev.snapshot.modules) {
      moduleToRepo().delete(m.id);
    }
  }
  repos().set(rid, { snapshot, rootPath });
  for (const m of snapshot.modules) {
    moduleToRepo().set(m.id, rid);
  }
}

export function getRepository(rid: string): RepoRecord | undefined {
  ensureSnapshotLoaded();
  return repos().get(rid);
}

export function getAnalysis(aid: string): AnalysisRecord | undefined {
  return analyses().get(aid);
}

export function putAnalysis(record: AnalysisRecord): void {
  analyses().set(record.id, record);
}

export function updateAnalysis(
  aid: string,
  patch: Partial<AnalysisRecord>,
): AnalysisRecord | undefined {
  const cur = analyses().get(aid);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  analyses().set(aid, next);
  return next;
}

export function findRepositoryIdForModule(moduleId: string): string | undefined {
  ensureSnapshotLoaded();
  return moduleToRepo().get(moduleId);
}
