import fs from "node:fs";
import path from "node:path";
import { Project } from "ts-morph";
import type { CompilerOptions } from "typescript";
import {
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  JsxEmit,
} from "typescript";
import type { ArchitecturalRole, Element, FileDependency } from "@archmap/graph-model";
import { shortId } from "./ids.js";
import { detectFrameworkInfo } from "./detection/framework.js";
import { classifyRole, computeElementFlags } from "./detection/classify.js";

export interface BuildFileGraphOptions {
  rootPath: string;
  files: string[];
  hasTsconfig: boolean;
}

export interface FileScanInfo {
  absPath: string;
  relPath: string;
  role: ArchitecturalRole;
  flags: Element["flags"];
}

export interface FileGraphResult {
  fileDependencies: FileDependency[];
  internalEdges: {
    sourceFilePath: string;
    targetFilePath: string;
    importSpecifier: string;
  }[];
  fileScanInfos: FileScanInfo[];
}

export function buildFileGraph(options: BuildFileGraphOptions): FileGraphResult {
  const { rootPath, files, hasTsconfig } = options;
  const tsconfigPath = path.join(rootPath, "tsconfig.json");
  const useTsconfig = hasTsconfig && fs.existsSync(tsconfigPath);
  const framework = detectFrameworkInfo(rootPath);

  const fallbackOptions: CompilerOptions = {
    allowJs: true,
    checkJs: false,
    jsx: JsxEmit.ReactJSX,
    target: ScriptTarget.ES2022,
    module: ModuleKind.ESNext,
    moduleResolution: ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    skipLibCheck: true,
  };

  const project = new Project({
    ...(useTsconfig
      ? { tsConfigFilePath: tsconfigPath }
      : { compilerOptions: fallbackOptions }),
    skipAddingFilesFromTsConfig: true,
  } as never);

  const fileSet = new Set(files.map((f) => path.normalize(f)));
  for (const f of files) {
    try {
      project.addSourceFileAtPath(f);
    } catch {
      /* skip */
    }
  }

  const internalEdges: FileGraphResult["internalEdges"] = [];
  const seen = new Set<string>();
  const fileScanInfos: FileScanInfo[] = [];

  for (const sourcePath of files) {
    const normSource = path.normalize(sourcePath);
    const sf = project.getSourceFile(normSource);
    if (!sf) continue;
    const rel = path.relative(rootPath, normSource).replace(/\\/g, "/");
    const role = classifyRole(rel, framework);
    fileScanInfos.push({
      absPath: normSource,
      relPath: rel,
      role,
      flags: computeElementFlags(sf, rel, role),
    });

    const addEdge = (specifier: string, targetPath: string | undefined) => {
      if (!targetPath) return;
      const normTarget = path.normalize(targetPath);
      if (!fileSet.has(normTarget) || normTarget === normSource) return;
      const key = `${normSource}|${normTarget}|${specifier}`;
      if (seen.has(key)) return;
      seen.add(key);
      internalEdges.push({
        sourceFilePath: normSource,
        targetFilePath: normTarget,
        importSpecifier: specifier,
      });
    };

    for (const decl of sf.getImportDeclarations()) {
      const spec = decl.getModuleSpecifierValue();
      const targetSf = decl.getModuleSpecifierSourceFile();
      addEdge(spec, targetSf?.getFilePath());
    }

    for (const decl of sf.getExportDeclarations()) {
      const spec = decl.getModuleSpecifierValue();
      if (!spec) continue;
      const targetSf = decl.getModuleSpecifierSourceFile();
      addEdge(spec, targetSf?.getFilePath());
    }
  }

  const fileDependencies: FileDependency[] = internalEdges.map((e) => ({
    id: shortId("fdep", [e.sourceFilePath, e.targetFilePath, e.importSpecifier]),
    sourceFilePath: e.sourceFilePath,
    targetFilePath: e.targetFilePath,
    type: "import" as const,
    importSpecifier: e.importSpecifier || undefined,
  }));

  return { fileDependencies, internalEdges, fileScanInfos };
}
