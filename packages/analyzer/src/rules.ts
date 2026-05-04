import path from "node:path";
import type { Element, Violation } from "@archmap/graph-model";
import { shortId } from "./ids.js";

export interface RuleEngineInput {
  repositoryId: string;
  rootPath: string;
  moduleIds: string[];
  adjacency: Map<string, Set<string>>;
  moduleDependencies: {
    sourceModuleId: string;
    targetModuleId: string;
    weight: number;
  }[];
  internalEdges: {
    sourceFilePath: string;
    targetFilePath: string;
    importSpecifier: string;
  }[];
  fileToModuleId: Map<string, string>;
  moduleFolderPath: Map<string, string>;
  elements?: Element[];
  /** Skip high-coupling noise on catch-all bucket */
  rootModuleId?: string;
}

function norm(p: string): string {
  return path.normalize(p);
}

function elementIdByAbs(rootPath: string, elements: Element[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const el of elements) {
    const abs = norm(path.join(rootPath, el.filePath.replace(/\//g, path.sep)));
    m.set(abs, el.id);
  }
  return m;
}

/** Tarjan SCC — returns components with >1 node or single-node with self-loop */
export function findCycleGroups(adj: Map<string, Set<string>>): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const result: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w !== undefined) {
          onStack.delete(w);
          scc.push(w);
        }
      } while (w !== v);

      const hasSelfLoop = scc.length === 1 && (adj.get(scc[0]!)?.has(scc[0]!) ?? false);
      if (scc.length > 1 || hasSelfLoop) {
        result.push(scc);
      }
    }
  }

  for (const v of adj.keys()) {
    if (!indices.has(v)) strongConnect(v);
  }

  return result;
}

export function runRules(input: RuleEngineInput): Violation[] {
  const {
    repositoryId,
    rootPath,
    adjacency,
    moduleDependencies,
    internalEdges,
    fileToModuleId,
    moduleFolderPath,
    elements = [],
    rootModuleId,
  } = input;

  const violations: Violation[] = [];
  const elByAbs = elementIdByAbs(rootPath, elements);

  const cycles = findCycleGroups(adjacency);
  const seenCycle = new Set<string>();
  for (const cyc of cycles) {
    const sorted = [...cyc].sort().join(",");
    if (seenCycle.has(sorted)) continue;
    seenCycle.add(sorted);
    const tour = cyc.length > 1 ? `${cyc.join(" → ")} → ${cyc[0]}` : `${cyc[0]} → ${cyc[0]}`;
    violations.push({
      id: shortId("viol", ["cycle", sorted]),
      repositoryId,
      type: "circular-dependency",
      severity: "high",
      message: `Circular dependency: ${tour}`,
      moduleIds: cyc,
      evidence: [{ type: "cycle", detail: tour }],
    });
  }

  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const m of input.moduleIds) {
    outDegree.set(m, 0);
    inDegree.set(m, 0);
  }
  for (const e of moduleDependencies) {
    outDegree.set(e.sourceModuleId, (outDegree.get(e.sourceModuleId) ?? 0) + 1);
    inDegree.set(e.targetModuleId, (inDegree.get(e.targetModuleId) ?? 0) + 1);
  }

  const threshold = 8;
  for (const id of input.moduleIds) {
    if (rootModuleId && id === rootModuleId) continue;
    const deg = (outDegree.get(id) ?? 0) + (inDegree.get(id) ?? 0);
    if (deg >= threshold) {
      violations.push({
        id: shortId("viol", ["coupling", id]),
        repositoryId,
        moduleId: id,
        type: "high-coupling",
        severity: deg >= 16 ? "high" : "medium",
        message: `Module has high coupling (fan-in + fan-out edge types: ${deg})`,
        moduleIds: [id],
        evidence: [{ type: "degree-sum", detail: String(deg) }],
      });
    }
  }

  const normRoot = path.normalize(rootPath);
  const seenDeep = new Set<string>();

  for (const edge of internalEdges) {
    const sm = fileToModuleId.get(norm(edge.sourceFilePath));
    const tm = fileToModuleId.get(norm(edge.targetFilePath));
    if (!sm || !tm || sm === tm) continue;

    const targetModuleFolder = moduleFolderPath.get(tm);
    if (!targetModuleFolder) continue;

    const targetNorm = norm(edge.targetFilePath);
    let rel = path.relative(targetModuleFolder, targetNorm);
    rel = rel.replace(/\\/g, "/");
    const segments = rel.split("/").filter(Boolean);
    const isDeepTarget = segments.length > 1;

    if (isDeepTarget) {
      const dedupe = `${sm}|${tm}|${targetNorm}`;
      if (seenDeep.has(dedupe)) continue;
      seenDeep.add(dedupe);
      const srcRel = path.relative(normRoot, edge.sourceFilePath).replace(/\\/g, "/");
      const tgtRel = path.relative(normRoot, edge.targetFilePath).replace(/\\/g, "/");
      const srcId = elByAbs.get(norm(edge.sourceFilePath));
      const tgtId = elByAbs.get(norm(edge.targetFilePath));
      violations.push({
        id: shortId("viol", ["deep", edge.sourceFilePath, edge.targetFilePath]),
        repositoryId,
        moduleId: sm,
        type: "deep-import",
        severity: "medium",
        message: `Deep import from ${srcRel} into ${tgtRel}`,
        moduleIds: [sm, tm],
        elementIds: [srcId, tgtId].filter((x): x is string => Boolean(x)),
        evidence: [
          {
            type: "cross-boundary-internal-access",
            detail: `${srcRel} imports ${tgtRel}`,
          },
        ],
      });
    }
  }

  const pairCounts = new Map<string, number>();
  for (const e of moduleDependencies) {
    const k = `${e.sourceModuleId}|${e.targetModuleId}`;
    pairCounts.set(k, (pairCounts.get(k) ?? 0) + e.weight);
  }
  for (const [k, w] of pairCounts) {
    if (w >= 20) {
      const [a, b] = k.split("|") as [string, string];
      violations.push({
        id: shortId("viol", ["cross", k]),
        repositoryId,
        type: "cross-boundary",
        severity: "low",
        message: `Strong dependency between modules (${w} file-level references)`,
        moduleIds: [a, b],
        evidence: [{ type: "weight", detail: String(w) }],
      });
    }
  }

  return violations;
}

export function buildAdjacency(
  moduleDependencies: { sourceModuleId: string; targetModuleId: string }[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of moduleDependencies) {
    if (!adj.has(e.sourceModuleId)) adj.set(e.sourceModuleId, new Set());
    adj.get(e.sourceModuleId)!.add(e.targetModuleId);
  }
  return adj;
}
