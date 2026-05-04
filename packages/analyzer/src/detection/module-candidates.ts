import path from "node:path";
import type { ArchModule, EvidenceEntry, ModuleScore } from "@archmap/graph-model";
import { shortId } from "../ids.js";
import type { FileScanInfo } from "../file-graph.js";
import type { Cluster } from "./clustering.js";
import type { StructuralBucket } from "./structural.js";

function norm(p: string): string {
  return path.normalize(p);
}

const DOMAINISH =
  /\b(auth|users?|catalog|order|payment|billing|checkout|inventory|profile|session|token|login)\b/i;
const UTILISH = /\b(util|helper|types?|constants|mock|fixture)\b/i;

function cohesionForCluster(
  clusterFiles: Set<string>,
  internalEdges: { sourceFilePath: string; targetFilePath: string }[],
): number {
  let internal = 0;
  let cross = 0;
  for (const e of internalEdges) {
    const a = norm(e.sourceFilePath);
    const b = norm(e.targetFilePath);
    const ia = clusterFiles.has(a);
    const ib = clusterFiles.has(b);
    if (ia && ib) internal += 1;
    else if (ia !== ib) cross += 1;
  }
  const t = internal + cross;
  if (t === 0) return 58;
  const bonus = Math.min(8, clusterFiles.size * 3);
  return Math.round((100 * (internal + bonus)) / (t + bonus));
}

function encapsulationForCluster(
  clusterFiles: Set<string>,
  internalEdges: { sourceFilePath: string; targetFilePath: string }[],
): number {
  let inboundFromOutside = 0;
  let outboundToOutside = 0;
  for (const e of internalEdges) {
    const a = norm(e.sourceFilePath);
    const b = norm(e.targetFilePath);
    const ia = clusterFiles.has(a);
    const ib = clusterFiles.has(b);
    if (!ia && ib) inboundFromOutside += 1;
    if (ia && !ib) outboundToOutside += 1;
  }
  const pressure = inboundFromOutside + outboundToOutside;
  if (pressure === 0) return 85;
  const internalMass = clusterFiles.size * 2;
  return Math.max(25, Math.min(95, Math.round(100 - (100 * pressure) / (pressure + internalMass))));
}

function domainNamingForCluster(clusterFiles: string[], rootPath: string): number {
  let hit = 0;
  for (const f of clusterFiles) {
    const rel = path.relative(rootPath, f).replace(/\\/g, "/");
    if (DOMAINISH.test(rel)) hit += 1;
  }
  if (clusterFiles.length === 0) return 40;
  return Math.round((100 * hit) / clusterFiles.length);
}

function roleDiversityForCluster(
  clusterFiles: Set<string>,
  scanByPath: Map<string, FileScanInfo>,
): number {
  const roles = new Set<string>();
  for (const f of clusterFiles) {
    roles.add(scanByPath.get(f)?.role ?? "unknown");
  }
  const n = roles.size;
  if (n <= 1) return 35;
  if (n === 2) return 55;
  if (n === 3) return 72;
  return 88;
}

function utilityNoisePenaltyForCluster(
  clusterFiles: Set<string>,
  scanByPath: Map<string, FileScanInfo>,
  rootPath: string,
): number {
  let util = 0;
  for (const f of clusterFiles) {
    const role = scanByPath.get(f)?.role ?? "unknown";
    const rel = path.relative(rootPath, f).toLowerCase();
    if (
      role === "util" ||
      role === "types" ||
      role === "constants" ||
      role === "test" ||
      role === "generated" ||
      UTILISH.test(rel)
    ) {
      util += 1;
    }
  }
  if (clusterFiles.size === 0) return 0;
  return Math.round((100 * util) / clusterFiles.size);
}

function structuralBoundaryForCluster(cluster: Cluster): number {
  if (cluster.idKey.startsWith("___root___") || cluster.structuralKeys.length === 0) return 42;
  return 86;
}

export interface ScoredCluster {
  cluster: Cluster;
  moduleCandidate: number;
  score: ModuleScore;
  evidence: EvidenceEntry[];
}

export function scoreClusters(
  clusters: Cluster[],
  rootPath: string,
  internalEdges: { sourceFilePath: string; targetFilePath: string }[],
  scanByPath: Map<string, FileScanInfo>,
): ScoredCluster[] {
  const out: ScoredCluster[] = [];
  for (const cl of clusters) {
    const fileSet = new Set(cl.files.map(norm));
    const structuralBoundary = structuralBoundaryForCluster(cl);
    const cohesion = cohesionForCluster(fileSet, internalEdges);
    const encapsulation = encapsulationForCluster(fileSet, internalEdges);
    const domainNaming = domainNamingForCluster(cl.files, rootPath);
    const roleDiversity = roleDiversityForCluster(fileSet, scanByPath);
    const utilityNoisePenalty = utilityNoisePenaltyForCluster(fileSet, scanByPath, rootPath);
    const moduleCandidate = Math.round(
      0.25 * structuralBoundary +
        0.25 * cohesion +
        0.2 * encapsulation +
        0.2 * domainNaming +
        0.1 * roleDiversity -
        0.2 * utilityNoisePenalty,
    );
    const clamped = Math.max(0, Math.min(100, moduleCandidate));
    const score: ModuleScore = {
      moduleCandidate: clamped,
      structuralBoundary,
      cohesion,
      encapsulation,
      domainNaming,
      roleDiversity,
      utilityNoisePenalty,
    };
    const evidence: EvidenceEntry[] = [
      {
        type: "structural-boundary",
        weight: structuralBoundary / 100,
        detail: `Structural boundary signal ${structuralBoundary}/100`,
      },
      {
        type: "internal-cohesion",
        weight: cohesion / 100,
        detail: `Internal vs cross-boundary import density ${cohesion}/100`,
      },
      {
        type: "encapsulation",
        weight: encapsulation / 100,
        detail: `Encapsulation pressure score ${encapsulation}/100`,
      },
    ];
    out.push({ cluster: cl, moduleCandidate: clamped, score, evidence });
  }
  return out;
}

function bucketFolderPath(key: string, buckets: StructuralBucket[]): string | null {
  const b = buckets.find((x) => x.key === key);
  return b?.absRoot ?? null;
}

function boundaryRootPaths(cluster: Cluster, buckets: StructuralBucket[], rootPath: string): string[] {
  const rels: string[] = [];
  for (const k of cluster.structuralKeys) {
    const abs = bucketFolderPath(k, buckets);
    if (abs) rels.push(path.relative(rootPath, abs).replace(/\\/g, "/"));
  }
  if (rels.length === 0 && cluster.files[0]) {
    rels.push(path.dirname(path.relative(rootPath, cluster.files[0]!)).replace(/\\/g, "/"));
  }
  return rels.length ? rels : ["."];
}

export function promoteClusters(
  repositoryId: string,
  rootPath: string,
  scored: ScoredCluster[],
  threshold: number,
  buckets: StructuralBucket[],
): {
  modules: ArchModule[];
  fileToModuleId: Map<string, string>;
  rootModuleId: string;
} {
  const rootModuleId = shortId("mod", [repositoryId, "__root__"]);
  const modules: ArchModule[] = [];
  const fileToModuleId = new Map<string, string>();

  modules.push({
    id: rootModuleId,
    repositoryId,
    name: "(unassigned)",
    folderPath: path.normalize(rootPath),
    kind: "root-bucket",
    source: "inferred",
    confidence: 0.35,
    score: {
      moduleCandidate: 30,
      structuralBoundary: 40,
      cohesion: 30,
      encapsulation: 40,
      domainNaming: 35,
      roleDiversity: 20,
      utilityNoisePenalty: 10,
    },
    boundaries: { rootPaths: ["."] },
    elementIds: [],
    evidence: [{ type: "root-bucket", detail: "Catch-all for files not in promoted modules" }],
    promoted: true,
  });

  for (const sc of scored) {
    if (sc.moduleCandidate < threshold) continue;
    const modId = shortId("mod", [repositoryId, sc.cluster.idKey]);
    const display =
      sc.cluster.structuralKeys[0]?.replace(/^packages\//, "") ??
      sc.cluster.idKey.split("#")[0] ??
      "module";
    const primaryBucket = sc.cluster.structuralKeys[0]
      ? bucketFolderPath(sc.cluster.structuralKeys[0]!, buckets)
      : null;
    const folderPath =
      primaryBucket ??
      (sc.cluster.files[0] ? path.dirname(sc.cluster.files[0]!) : path.normalize(rootPath));
    const boundaries = {
      rootPaths: boundaryRootPaths(sc.cluster, buckets, rootPath),
      packages: sc.cluster.structuralKeys.filter((k) => k.startsWith("packages/")),
    };
    modules.push({
      id: modId,
      repositoryId,
      name: display === "___root___" ? "(root files)" : display,
      description: `Inferred cluster ${sc.cluster.idKey}`,
      folderPath: path.normalize(folderPath),
      kind: "business-module",
      source: "inferred",
      confidence: Math.max(0, Math.min(1, sc.moduleCandidate / 100)),
      score: sc.score,
      boundaries,
      elementIds: [],
      evidence: sc.evidence,
      promoted: true,
    });
    for (const f of sc.cluster.files) {
      fileToModuleId.set(norm(f), modId);
    }
  }

  for (const sc of scored) {
    if (sc.moduleCandidate >= threshold) continue;
    for (const f of sc.cluster.files) {
      fileToModuleId.set(norm(f), rootModuleId);
    }
  }

  return { modules, fileToModuleId, rootModuleId };
}

export function attachModuleElementRefs(
  modules: ArchModule[],
  elements: { id: string; moduleId: string; role: string; flags: { isPublicExport: boolean } }[],
): void {
  const byMod = new Map<string, typeof elements>();
  for (const el of elements) {
    const arr = byMod.get(el.moduleId) ?? [];
    arr.push(el);
    byMod.set(el.moduleId, arr);
  }
  for (const m of modules) {
    const els = byMod.get(m.id) ?? [];
    m.elementIds = els.map((e) => e.id);
    m.entryPoints = els.filter((e) => e.role === "route" || e.flags.isPublicExport).map((e) => e.id);
    m.publicSurface = els.filter((e) => e.flags.isPublicExport).map((e) => e.id);
  }
}
