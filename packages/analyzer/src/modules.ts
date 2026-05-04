import path from "node:path";
import fs from "node:fs";
import type { ArchModule, Element, ModuleDependency, Seam } from "@archmap/graph-model";
import { shortId } from "./ids.js";

export interface ModuleInferenceInput {
  repositoryId: string;
  rootPath: string;
  files: string[];
  internalEdges: {
    sourceFilePath: string;
    targetFilePath: string;
    importSpecifier: string;
  }[];
}

export interface ModuleInferenceResult {
  modules: ArchModule[];
  fileToModuleId: Map<string, string>;
  elements: Element[];
  moduleDependencies: ModuleDependency[];
  seams: Seam[];
}

function normalizeSeg(p: string): string {
  return p.replace(/\\/g, "/");
}

function placeholderElement(
  _repositoryId: string,
  root: string,
  modId: string,
  filePath: string,
): Element {
  const rel = normalizeSeg(path.relative(root, filePath));
  const base = path.basename(filePath, path.extname(filePath));
  return {
    id: shortId("el", [modId, filePath]),
    moduleId: modId,
    type: "file",
    name: base,
    filePath: rel,
    role: "unknown",
    flags: {
      isPublicExport: false,
      isFrameworkEntryPoint: false,
      isGenerated: false,
      isTestOnly: false,
    },
    metrics: {
      distinctCallerCount: 0,
      distinctCallingModuleCount: 0,
      fanIn: 0,
      fanOut: 0,
      downstreamReach: 0,
    },
    visibility: {
      surfaceVisibilityScore: 50,
      collapsedByDefault: true,
    },
    noiseScore: 15,
    evidence: [{ type: "legacy-infer", detail: "inferModules() placeholder metrics" }],
  };
}

function folderModule(
  repositoryId: string,
  id: string,
  name: string,
  folderPath: string,
  confidence: number,
  description: string,
  rootPaths: string[],
): ArchModule {
  return {
    id,
    repositoryId,
    name,
    folderPath: normalizeSeg(folderPath),
    kind: name.includes("root") ? "root-bucket" : "business-module",
    source: "structural",
    confidence,
    score: {
      moduleCandidate: Math.round(confidence * 100),
      structuralBoundary: 80,
      cohesion: 60,
      encapsulation: 60,
      domainNaming: 55,
      roleDiversity: 40,
      utilityNoisePenalty: 10,
    },
    boundaries: { rootPaths },
    elementIds: [],
    evidence: [{ type: "folder-boundary", detail: description }],
    promoted: true,
    description,
  };
}

/** Legacy folder-only inference; prefer analyzeRepository() for doc-aligned pipeline. */
export function inferModules(input: ModuleInferenceInput): ModuleInferenceResult {
  const { repositoryId, rootPath, files, internalEdges } = input;
  const root = path.normalize(rootPath);
  const srcDir = path.join(root, "src");
  const useSrc = fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory();
  const baseDir = useSrc ? srcDir : root;

  const topLevelDirs = new Map<string, string>();
  if (useSrc) {
    for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      const full = path.join(srcDir, ent.name);
      topLevelDirs.set(ent.name, full);
    }
  } else {
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      if (["node_modules", "dist", ".git", "coverage", ".next", "packages"].includes(ent.name))
        continue;
      const full = path.join(root, ent.name);
      topLevelDirs.set(ent.name, full);
    }
  }

  const moduleNames = [...topLevelDirs.keys()].sort();
  const modules: ArchModule[] = [];
  const nameToId = new Map<string, string>();

  const rootModuleId = shortId("mod", [repositoryId, "__root__"]);
  modules.push(
    folderModule(
      repositoryId,
      rootModuleId,
      useSrc ? "(src root)" : "(root)",
      baseDir,
      0.7,
      "Files not under a first-level folder",
      ["."],
    ),
  );
  nameToId.set("__root__", rootModuleId);

  for (const name of moduleNames) {
    const id = shortId("mod", [repositoryId, name]);
    nameToId.set(name, id);
    const folderPath = topLevelDirs.get(name)!;
    modules.push(
      folderModule(
        repositoryId,
        id,
        name,
        folderPath,
        0.85,
        `Inferred from folder ${name}`,
        [normalizeSeg(path.relative(root, folderPath))],
      ),
    );
  }

  const fileToModuleId = new Map<string, string>();

  function assignModule(filePath: string): string {
    const norm = path.normalize(filePath);
    const hit = fileToModuleId.get(norm);
    if (hit) return hit;

    let best: { id: string; len: number } | null = null;
    for (const name of moduleNames) {
      const folder = topLevelDirs.get(name)!;
      const prefix = folder + path.sep;
      if (norm.startsWith(prefix) || norm === folder) {
        const id = nameToId.get(name)!;
        if (!best || folder.length > best.len) {
          best = { id, len: folder.length };
        }
      }
    }
    const modId = best?.id ?? rootModuleId;
    fileToModuleId.set(norm, modId);
    return modId;
  }

  for (const f of files) {
    assignModule(f);
  }

  const elements: Element[] = [];
  for (const f of files) {
    const modId = assignModule(f);
    elements.push(placeholderElement(repositoryId, root, modId, f));
  }

  for (const m of modules) {
    m.elementIds = elements.filter((e) => e.moduleId === m.id).map((e) => e.id);
  }

  const pairWeights = new Map<string, { count: number; examples: { s: string; t: string }[] }>();

  for (const e of internalEdges) {
    const sm = assignModule(e.sourceFilePath);
    const tm = assignModule(e.targetFilePath);
    if (sm === tm) continue;
    const key = `${sm}|${tm}`;
    const cur = pairWeights.get(key) ?? { count: 0, examples: [] };
    cur.count += 1;
    if (cur.examples.length < 5) {
      cur.examples.push({
        s: normalizeSeg(path.relative(root, e.sourceFilePath)),
        t: normalizeSeg(path.relative(root, e.targetFilePath)),
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
    const seamScore = Math.min(100, Math.round((100 * weight) / (weight + 3)));
    seams.push({
      id: shortId("seam", [sourceModuleId, targetModuleId]),
      repositoryId,
      fromModuleId: sourceModuleId,
      toModuleId: targetModuleId,
      seamType: "import",
      strength: Math.min(1, seamScore / 100),
      evidenceCount: data.count,
      confidence: seamScore / 100,
      score: {
        seam: seamScore,
        crossBoundaryStrength: seamScore,
        interfaceEvidence: 50,
        repeatedInteraction: Math.min(100, weight * 10),
        roleBoundary: 50,
        dependencyDirection: 50,
        callerConvergence: 50,
        noisePenalty: 20,
      },
      evidence: [{ type: "legacy", detail: "Seam from inferModules() legacy path" }],
    });
  }

  return {
    modules,
    fileToModuleId,
    elements,
    moduleDependencies,
    seams,
  };
}

/** Exported symbols per file (simple): named exports + default */
export function extractPublicSurface(
  filePath: string,
  moduleId: string,
): { path: string; exports: string[] } {
  void moduleId;
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const exports: string[] = [];
    const exportNamed = /export\s+(?:async\s+)?function\s+(\w+)/g;
    const exportConst = /export\s+const\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = exportNamed.exec(text))) exports.push(m[1]!);
    while ((m = exportConst.exec(text))) exports.push(m[1]!);
    if (/export\s+default/.test(text)) exports.push("default");
    return { path: filePath, exports: [...new Set(exports)] };
  } catch {
    return { path: filePath, exports: [] };
  }
}
