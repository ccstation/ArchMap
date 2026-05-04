import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "@archmap/graph-model";
import { ingestRepository } from "./ingest.js";
import { buildFileGraph } from "./file-graph.js";
import { inferModules } from "./modules.js";
import { buildAdjacency, runRules } from "./rules.js";

export interface AnalyzeOptions {
  /** Absolute path to repository root */
  repoPath: string;
  /** Human-readable name */
  name?: string;
}

export async function analyzeRepository(options: AnalyzeOptions): Promise<Snapshot> {
  const { repoPath, name } = options;
  const ingested = await ingestRepository(repoPath);
  const repositoryId = randomUUID();
  const snapshotId = randomUUID();

  const graph = buildFileGraph({
    rootPath: ingested.rootPath,
    files: ingested.files,
    hasTsconfig: ingested.hasTsconfig,
  });

  const inferred = inferModules({
    repositoryId,
    rootPath: ingested.rootPath,
    files: ingested.files,
    internalEdges: graph.internalEdges,
  });

  const moduleFolderPath = new Map<string, string>();
  for (const m of inferred.modules) {
    moduleFolderPath.set(m.id, path.normalize(m.folderPath));
  }

  const adjacency = buildAdjacency(inferred.moduleDependencies);
  for (const m of inferred.modules) {
    if (!adjacency.has(m.id)) adjacency.set(m.id, new Set());
  }

  const violations = runRules({
    repositoryId,
    rootPath: ingested.rootPath,
    moduleIds: inferred.modules.map((m) => m.id),
    adjacency,
    moduleDependencies: inferred.moduleDependencies.map((d) => ({
      sourceModuleId: d.sourceModuleId,
      targetModuleId: d.targetModuleId,
      weight: d.weight,
    })),
    internalEdges: graph.internalEdges,
    fileToModuleId: inferred.fileToModuleId,
    moduleFolderPath,
  });

  const repoName =
    name ??
    ingested.packageName ??
    path.basename(ingested.rootPath);

  const snapshot: Snapshot = {
    meta: {
      id: snapshotId,
      repositoryId,
      commitHash: null,
      createdAt: new Date().toISOString(),
      graphVersion: 1,
    },
    repository: {
      id: repositoryId,
      name: repoName,
      path: ingested.rootPath,
      language: "TypeScript/JavaScript",
      framework: null,
      scanTime: new Date().toISOString(),
      commitHash: null,
    },
    modules: inferred.modules,
    elements: inferred.elements,
    fileDependencies: graph.fileDependencies,
    moduleDependencies: inferred.moduleDependencies,
    seams: inferred.seams,
    violations,
    overrides: undefined,
    ai: undefined,
  };

  return snapshot;
}

export function writeSnapshot(snapshot: Snapshot, outPath: string): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
}
