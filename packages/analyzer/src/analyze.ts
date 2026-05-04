import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FileDependency, Snapshot } from "@archmap/graph-model";
import { ingestRepository } from "./ingest.js";
import { buildFileGraph } from "./file-graph.js";
import { buildAdjacency, runRules } from "./rules.js";
import { shortId } from "./ids.js";
import { defaultAnalysisMeta, ANALYSIS_VERSION } from "./detection/constants.js";
import { detectFrameworkInfo } from "./detection/framework.js";
import { listStructuralBuckets } from "./detection/structural.js";
import { inferClusters } from "./detection/clustering.js";
import {
  scoreClusters,
  promoteClusters,
  attachModuleElementRefs,
} from "./detection/module-candidates.js";
import { buildElements } from "./detection/element-metrics.js";
import { buildModuleDependenciesAndSeams } from "./detection/seam-scoring.js";
import { buildModuleImportCallSites } from "./import-linked-call-sites.js";

export interface AnalyzeOptions {
  repoPath: string;
  name?: string;
}

function norm(p: string): string {
  return path.normalize(p);
}

function enrichFileDependencies(
  fileDeps: FileDependency[],
  rootPath: string,
  elements: { id: string; filePath: string }[],
  fileToModuleId: Map<string, string>,
): FileDependency[] {
  const elByAbs = new Map<string, string>();
  for (const el of elements) {
    const abs = norm(path.join(rootPath, ...el.filePath.split("/")));
    elByAbs.set(abs, el.id);
  }
  return fileDeps.map((fd) => {
    const sa = norm(fd.sourceFilePath);
    const ta = norm(fd.targetFilePath);
    const sm = fileToModuleId.get(sa);
    const tm = fileToModuleId.get(ta);
    return {
      ...fd,
      sourceElementId: elByAbs.get(sa),
      targetElementId: elByAbs.get(ta),
      isCrossBoundary: Boolean(sm && tm && sm !== tm),
    };
  });
}

export async function analyzeRepository(options: AnalyzeOptions): Promise<Snapshot> {
  const { repoPath, name } = options;
  const ingested = await ingestRepository(repoPath);
  const repositoryId = randomUUID();
  const snapshotId = randomUUID();
  const frameworkInfo = detectFrameworkInfo(ingested.rootPath);

  const graph = buildFileGraph({
    rootPath: ingested.rootPath,
    files: ingested.files,
    hasTsconfig: ingested.hasTsconfig,
  });

  try {
    return analyzeRepositoryBody(
      options,
      ingested,
      repositoryId,
      snapshotId,
      frameworkInfo,
      graph,
    );
  } finally {
    const p = graph.project as unknown as { forget?: () => void };
    p.forget?.();
  }
}

function analyzeRepositoryBody(
  options: AnalyzeOptions,
  ingested: Awaited<ReturnType<typeof ingestRepository>>,
  repositoryId: string,
  snapshotId: string,
  frameworkInfo: ReturnType<typeof detectFrameworkInfo>,
  graph: ReturnType<typeof buildFileGraph>,
): Snapshot {
  const { name } = options;

  const scanByPath = new Map(graph.fileScanInfos.map((s) => [s.absPath, s]));
  const buckets = listStructuralBuckets(ingested.rootPath);
  const clusters = inferClusters(ingested.files, buckets, graph.internalEdges);
  const scored = scoreClusters(clusters, ingested.rootPath, graph.internalEdges, scanByPath);
  const analysisMeta = defaultAnalysisMeta([
    "Static event edges not inferred in this analysis version.",
    "Seam score applies a +22 sparse-graph calibration after the canonical weighted sum.",
  ]);
  const { modules, fileToModuleId, rootModuleId } = promoteClusters(
    repositoryId,
    ingested.rootPath,
    scored,
    analysisMeta.thresholds.moduleCandidate,
    buckets,
  );

  const elements = buildElements(
    ingested.rootPath,
    ingested.files,
    fileToModuleId,
    scanByPath,
    graph.internalEdges,
    analysisMeta.thresholds,
    (modId, fileAbs) => shortId("el", [modId, fileAbs]),
  );
  attachModuleElementRefs(modules, elements);

  const { moduleDependencies, seams } = buildModuleDependenciesAndSeams({
    repositoryId,
    rootPath: ingested.rootPath,
    internalEdges: graph.internalEdges,
    fileToModuleId,
    rootModuleId,
    elements,
    thresholds: analysisMeta.thresholds,
  });

  const fileDependencies = enrichFileDependencies(
    graph.fileDependencies,
    ingested.rootPath,
    elements,
    fileToModuleId,
  );

  const { moduleImportCallSites } = buildModuleImportCallSites({
    project: graph.project,
    rootPath: ingested.rootPath,
    files: ingested.files,
    fileToModuleId,
    fileDependencies,
  });

  const moduleFolderPath = new Map(modules.map((m) => [m.id, path.normalize(m.folderPath)]));
  const adjacency = buildAdjacency(moduleDependencies);
  for (const m of modules) {
    if (!adjacency.has(m.id)) adjacency.set(m.id, new Set());
  }

  const violations = runRules({
    repositoryId,
    rootPath: ingested.rootPath,
    moduleIds: modules.map((m) => m.id),
    adjacency,
    moduleDependencies: moduleDependencies.map((d) => ({
      sourceModuleId: d.sourceModuleId,
      targetModuleId: d.targetModuleId,
      weight: d.weight,
    })),
    internalEdges: graph.internalEdges,
    fileToModuleId,
    moduleFolderPath,
    elements,
    rootModuleId,
  });

  const repoName = name ?? ingested.packageName ?? path.basename(ingested.rootPath);

  const snapshot: Snapshot = {
    meta: {
      id: snapshotId,
      repositoryId,
      commitHash: null,
      createdAt: new Date().toISOString(),
      graphVersion: 2,
      analysisVersion: ANALYSIS_VERSION,
    },
    repository: {
      id: repositoryId,
      name: repoName,
      path: ingested.rootPath,
      language: "TypeScript/JavaScript",
      languages: ["TypeScript", "JavaScript"],
      framework: frameworkInfo.frameworks[0] ?? null,
      frameworks: frameworkInfo.frameworks,
      packageManager: frameworkInfo.packageManager,
      scanTime: new Date().toISOString(),
      commitHash: null,
    },
    analysisMeta,
    modules,
    elements,
    fileDependencies,
    moduleDependencies,
    seams,
    violations,
    overrides: undefined,
    ai: undefined,
    moduleImportCallSites,
  };

  return snapshot;
}

export function writeSnapshot(snapshot: Snapshot, outPath: string): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
}
