import path from "node:path";
import type { Element, ModuleDependency, Seam, SeamScore } from "@archmap/graph-model";
import type { AnalysisThresholds } from "@archmap/graph-model";
import { shortId } from "../ids.js";

function norm(p: string): string {
  return path.normalize(p);
}

function roleBoundaryPoints(role: string): number {
  if (role === "facade" || role === "service" || role === "route") return 88;
  if (role === "repository" || role === "adapter") return 72;
  if (role === "util" || role === "types" || role === "constants") return 35;
  return 55;
}

function seamNoisePenalty(fromEls: Element[], toEls: Element[]): number {
  if (!fromEls.length || !toEls.length) return 22;
  const utilish = (e: Element) =>
    e.role === "util" || e.role === "types" || e.role === "constants" || e.noiseScore > 55;
  const a = fromEls.filter(utilish).length / Math.max(1, fromEls.length);
  const b = toEls.filter(utilish).length / Math.max(1, toEls.length);
  return Math.round(100 * (0.5 * a + 0.5 * b));
}

export function buildModuleDependenciesAndSeams(input: {
  repositoryId: string;
  rootPath: string;
  internalEdges: { sourceFilePath: string; targetFilePath: string; importSpecifier: string }[];
  fileToModuleId: Map<string, string>;
  rootModuleId: string;
  elements: Element[];
  thresholds: AnalysisThresholds;
}): { moduleDependencies: ModuleDependency[]; seams: Seam[] } {
  const {
    repositoryId,
    rootPath,
    internalEdges,
    fileToModuleId,
    rootModuleId,
    elements,
    thresholds,
  } = input;
  const normRoot = path.normalize(rootPath);
  const elByPath = new Map<string, Element>();
  for (const el of elements) {
    elByPath.set(norm(path.join(normRoot, el.filePath)), el);
  }

  const pairWeights = new Map<
    string,
    { count: number; examples: { s: string; t: string }[]; targets: Set<string>; sources: Set<string> }
  >();

  for (const e of internalEdges) {
    const sm = fileToModuleId.get(norm(e.sourceFilePath));
    const tm = fileToModuleId.get(norm(e.targetFilePath));
    if (!sm || !tm || sm === tm) continue;
    if (sm === rootModuleId && tm === rootModuleId) continue;
    const key = `${sm}|${tm}`;
    const cur = pairWeights.get(key) ?? {
      count: 0,
      examples: [],
      targets: new Set<string>(),
      sources: new Set<string>(),
    };
    cur.count += 1;
    cur.targets.add(norm(e.targetFilePath));
    cur.sources.add(norm(e.sourceFilePath));
    if (cur.examples.length < 8) {
      cur.examples.push({
        s: path.relative(normRoot, e.sourceFilePath).replace(/\\/g, "/"),
        t: path.relative(normRoot, e.targetFilePath).replace(/\\/g, "/"),
      });
    }
    pairWeights.set(key, cur);
  }

  const moduleDependencies: ModuleDependency[] = [];
  const seams: Seam[] = [];

  for (const [key, data] of pairWeights) {
    const [sourceModuleId, targetModuleId] = key.split("|") as [string, string];
    const weight = data.count;
    const evidence = data.examples.map((ex) => ({
      sourceFilePath: ex.s,
      targetFilePath: ex.t,
    }));
    moduleDependencies.push({
      id: shortId("mdep", [sourceModuleId, targetModuleId]),
      sourceModuleId,
      targetModuleId,
      type: "import",
      weight,
      evidenceCount: data.count,
      evidence,
    });

    const toEls = [...data.targets]
      .map((p) => elByPath.get(p))
      .filter((x): x is Element => Boolean(x));
    const fromEls = [...data.sources]
      .map((p) => elByPath.get(p))
      .filter((x): x is Element => Boolean(x));
    const ifaceBase =
      toEls.length > 0
        ? Math.round(
            toEls.reduce((acc, el) => acc + (el.flags.isPublicExport ? 26 : 10), 0) / toEls.length,
          )
        : 42;
    const iface = Math.min(100, ifaceBase + Math.min(36, data.targets.size * 8));
    const crossBoundaryStrength = Math.min(
      100,
      Math.round(58 + (42 * weight) / (weight + 1)),
    );
    const repeatedInteraction = Math.min(100, 18 + 14 * Math.sqrt(weight));
    const roleBoundaryScore =
      toEls.length > 0
        ? Math.round(toEls.reduce((a, el) => a + roleBoundaryPoints(el.role), 0) / toEls.length)
        : 52;
    const dependencyDirectionSignificance = 58;
    const callerConvergence = Math.min(100, Math.round(32 + 12 * Math.sqrt(weight)));
    const noise = seamNoisePenalty(fromEls, toEls);
    const seamRaw =
      0.25 * crossBoundaryStrength +
      0.2 * iface +
      0.2 * repeatedInteraction +
      0.15 * roleBoundaryScore +
      0.1 * dependencyDirectionSignificance +
      0.1 * callerConvergence -
      0.25 * noise;
    /** Sparse graphs under-score with file-only edges; align with MVP promotion band. */
    const seamScoreVal = Math.max(0, Math.min(100, Math.round(seamRaw + 22)));
    const score: SeamScore = {
      seam: seamScoreVal,
      crossBoundaryStrength,
      interfaceEvidence: iface,
      repeatedInteraction,
      roleBoundary: roleBoundaryScore,
      dependencyDirection: dependencyDirectionSignificance,
      callerConvergence,
      noisePenalty: noise,
    };
    if (seamScoreVal < thresholds.seamPromotion) continue;
    const viaElementIds = [...new Set(toEls.map((e) => e.id))].slice(0, 12);
    const evidenceSeam = [
      {
        type: "cross-boundary-imports",
        weight: crossBoundaryStrength / 100,
        detail: `${weight} file-level imports from module to module`,
      },
    ];
    if (iface > 55) {
      evidenceSeam.push({
        type: "interface-surface",
        weight: iface / 100,
        detail: "Targets include public or entry-like elements",
      });
    }
    seams.push({
      id: shortId("seam", [sourceModuleId, targetModuleId]),
      repositoryId,
      fromModuleId: sourceModuleId,
      toModuleId: targetModuleId,
      seamType: "import",
      strength: seamScoreVal / 100,
      evidenceCount: data.count,
      confidence: seamScoreVal / 100,
      score,
      evidence: evidenceSeam,
      viaElementIds,
    });
  }

  return { moduleDependencies, seams };
}
