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

/** First-level folders under `src` or root become module roots */
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
  modules.push({
    id: rootModuleId,
    repositoryId,
    name: useSrc ? "(src root)" : "(root)",
    folderPath: normalizeSeg(baseDir),
    inferredConfidence: 0.7,
    description: "Files not under a first-level folder",
  });
  nameToId.set("__root__", rootModuleId);

  for (const name of moduleNames) {
    const id = shortId("mod", [repositoryId, name]);
    nameToId.set(name, id);
    const folderPath = topLevelDirs.get(name)!;
    modules.push({
      id,
      repositoryId,
      name,
      folderPath: normalizeSeg(folderPath),
      inferredConfidence: 0.85,
      description: `Inferred from folder ${name}`,
    });
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
    const rel = path.relative(root, f);
    const base = path.basename(f, path.extname(f));
    elements.push({
      id: shortId("el", [modId, f]),
      moduleId: modId,
      type: "file",
      name: base,
      filePath: normalizeSeg(rel),
    });
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
    seams.push({
      id: shortId("seam", [sourceModuleId, targetModuleId]),
      repositoryId,
      fromModuleId: sourceModuleId,
      toModuleId: targetModuleId,
      seamType: "import",
      strength: Math.min(1, weight / (5 + weight)),
      evidenceCount: data.count,
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
