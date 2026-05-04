import path from "node:path";
import { UndirectedGraph } from "graphology";
import louvainFactory from "graphology-communities-louvain";
import type { StructuralBucket } from "./structural.js";
import { structuralKeyForFile } from "./structural.js";

const louvain = louvainFactory as unknown as (
  graph: UndirectedGraph,
  opts?: { getEdgeWeight?: "weight" },
) => Record<string, number>;

export interface Cluster {
  /** Stable id fragment for hashing */
  idKey: string;
  files: string[];
  structuralKeys: string[];
}

function norm(p: string): string {
  return path.normalize(p);
}

export function buildLouvainCommunities(
  files: string[],
  internalEdges: { sourceFilePath: string; targetFilePath: string }[],
): Map<string, number> {
  const fileSet = new Set(files.map(norm));
  const graph = new UndirectedGraph();
  for (const f of files) {
    const n = norm(f);
    if (!graph.hasNode(n)) graph.addNode(n);
  }
  const edgeWeights = new Map<string, { a: string; b: string; w: number }>();
  for (const e of internalEdges) {
    const a0 = norm(e.sourceFilePath);
    const b0 = norm(e.targetFilePath);
    if (!fileSet.has(a0) || !fileSet.has(b0) || a0 === b0) continue;
    const [a, b] = a0 < b0 ? [a0, b0] : [b0, a0];
    const ek = `${a}:::${b}`;
    const cur = edgeWeights.get(ek);
    if (cur) cur.w += 1;
    else edgeWeights.set(ek, { a, b, w: 1 });
  }
  for (const { a, b, w } of edgeWeights.values()) {
    if (!graph.hasNode(a)) graph.addNode(a);
    if (!graph.hasNode(b)) graph.addNode(b);
    graph.addEdge(a, b, { weight: w });
  }
  if (graph.order === 0) return new Map();
  try {
    const communities = louvain(graph, { getEdgeWeight: "weight" });
    return new Map(
      Object.entries(communities).map(([k, v]) => [norm(k), Number(v)]),
    );
  } catch {
    return new Map(files.map((f) => [norm(f), 0]));
  }
}

export function inferClusters(
  files: string[],
  buckets: StructuralBucket[],
  internalEdges: { sourceFilePath: string; targetFilePath: string }[],
): Cluster[] {
  const louvainMap = buildLouvainCommunities(files, internalEdges);
  const byStructural = new Map<string, string[]>();
  for (const f of files) {
    const sk = structuralKeyForFile(buckets, f) ?? "___root___";
    const arr = byStructural.get(sk) ?? [];
    arr.push(norm(f));
    byStructural.set(sk, arr);
  }
  const clusters: Cluster[] = [];
  for (const [structKey, groupFiles] of byStructural) {
    const uniq = [...new Set(groupFiles)].sort();
    const byComm = new Map<number, string[]>();
    for (const f of uniq) {
      const c = louvainMap.get(f) ?? 0;
      const arr = byComm.get(c) ?? [];
      arr.push(f);
      byComm.set(c, arr);
    }
    const multiMajor = [...byComm.values()].filter((fl) => fl.length >= 2);
    if (byComm.size <= 1 || multiMajor.length <= 1) {
      clusters.push({
        idKey: structKey,
        files: uniq,
        structuralKeys: structKey === "___root___" ? [] : [structKey],
      });
    } else {
      for (const [commId, fl] of [...byComm.entries()].sort((a, b) => b[1].length - a[1].length)) {
        clusters.push({
          idKey: `${structKey}#c${commId}`,
          files: [...new Set(fl)].sort(),
          structuralKeys: structKey === "___root___" ? [] : [structKey],
        });
      }
    }
  }
  const seen = new Set<string>();
  const deduped: Cluster[] = [];
  for (const c of clusters) {
    const sig = c.files.join("|");
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(c);
  }
  return deduped;
}
