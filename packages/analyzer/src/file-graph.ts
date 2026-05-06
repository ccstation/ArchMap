import fs from "node:fs";
import path from "node:path";
import type { Project } from "ts-morph";
import { Node, Project as TsMorphProject, SyntaxKind } from "ts-morph";
import type { CompilerOptions } from "typescript";
import { ScriptTarget, ModuleKind, ModuleResolutionKind, JsxEmit } from "typescript";
import type { ArchitecturalRole, DependencyType, Element, FileDependency } from "@archmap/graph-model";
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
    type: DependencyType;
  }[];
  fileScanInfos: FileScanInfo[];
  /** Caller must call `project.forget()` when analysis is done. */
  project: Project;
}

function apiRoutePathFromFile(absPath: string, rootPath: string): string | null {
  const rel = path.relative(rootPath, absPath).replace(/\\/g, "/");
  const appMatch = rel.match(/(?:^|\/)app\/api\/(.+)\/route\.(?:ts|tsx|js|jsx)$/);
  if (appMatch?.[1]) return `/api/${appMatch[1]}`;
  const pagesIndexMatch = rel.match(/(?:^|\/)pages\/api\/(.+)\/index\.(?:ts|tsx|js|jsx)$/);
  if (pagesIndexMatch?.[1]) return `/api/${pagesIndexMatch[1]}`;
  const pagesMatch = rel.match(/(?:^|\/)pages\/api\/(.+)\.(?:ts|tsx|js|jsx)$/);
  if (pagesMatch?.[1]) return `/api/${pagesMatch[1]}`;
  return null;
}

function classifyDependencyType(params: {
  importSpecifier: string;
  sourceFilePath: string;
  targetFilePath: string;
}): DependencyType {
  const spec = params.importSpecifier.toLowerCase();
  const routeLikeApiSpecifier = /^\/api(?:\/|$)/.test(spec);
  if (routeLikeApiSpecifier) return "api";

  const src = params.sourceFilePath.replace(/\\/g, "/").toLowerCase();
  const tgt = params.targetFilePath.replace(/\\/g, "/").toLowerCase();

  const sourceIsNextRouteOrPage =
    /\/app\//.test(src) || /\/src\/app\//.test(src) || /\/pages\//.test(src);

  const targetIsInternalApiPackage = /\/packages\/api\//.test(tgt);

  if (sourceIsNextRouteOrPage && targetIsInternalApiPackage) return "api";

  return "import";
}

function stripQueryAndHash(p: string): string {
  let s = p.trim();
  const q = s.indexOf("?");
  if (q >= 0) s = s.slice(0, q);
  const h = s.indexOf("#");
  if (h >= 0) s = s.slice(0, h);
  return s;
}

function normalizeApiPath(p: string): string {
  let s = stripQueryAndHash(p).replace(/\/+/g, "/");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

/** Match fetch URL to a registered Next route key (exact or longest-prefix parent route). */
function resolveApiRoutePath(
  rawPath: string | null | undefined,
  routes: Map<string, string>,
): string | null {
  if (!rawPath) return null;
  const n = normalizeApiPath(rawPath);
  if (!n.startsWith("/api")) return null;
  if (routes.has(n)) return n;
  let best: string | null = null;
  let bestLen = -1;
  for (const k of routes.keys()) {
    if (n === k) return k;
    if (n.startsWith(`${k}/`)) {
      if (k.length > bestLen) {
        bestLen = k.length;
        best = k;
      }
    }
  }
  return best;
}

function unwrapExpression(node: Node): Node {
  let n: Node = node;
  while (Node.isParenthesizedExpression(n) || Node.isAsExpression(n)) {
    n = n.getExpression();
  }
  return n;
}

/**
 * Extract a static `/api/...` path or prefix from fetch's first argument
 * (string, template head, string concat, URL constructor).
 */
function tryGetApiPathStringFromNode(expr: Node): string | null {
  const node = unwrapExpression(expr);
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    const t = node.getLiteralText();
    if (t.startsWith("/api")) return t;
    return null;
  }
  if (Node.isTemplateExpression(node)) {
    const head = node.getHead().getLiteralText();
    if (head.startsWith("/api")) return head;
    return null;
  }
  if (Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    const left = unwrapExpression(node.getLeft());
    if (Node.isStringLiteral(left)) {
      const lit = left.getLiteralText();
      if (lit.startsWith("/api")) return lit;
    }
  }
  const isUrlCtor =
    (Node.isNewExpression(node) || Node.isCallExpression(node)) &&
    Node.isIdentifier(node.getExpression()) &&
    node.getExpression().getText() === "URL";
  if (isUrlCtor) {
    const first = node.getArguments()[0];
    if (first) return tryGetApiPathStringFromNode(first);
  }
  return null;
}

function isFetchCallee(expr: Node): boolean {
  const e = unwrapExpression(expr);
  if (Node.isIdentifier(e) && e.getText() === "fetch") return true;
  if (Node.isPropertyAccessExpression(e)) {
    if (e.getName() !== "fetch") return false;
    const base = unwrapExpression(e.getExpression());
    if (Node.isIdentifier(base)) {
      const id = base.getText();
      return id === "window" || id === "globalThis" || id === "self";
    }
  }
  return false;
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

  const project = new TsMorphProject({
    ...(useTsconfig
      ? { tsConfigFilePath: tsconfigPath }
      : { compilerOptions: fallbackOptions }),
    skipAddingFilesFromTsConfig: true,
  } as never);

  const fileSet = new Set(files.map((f) => path.normalize(f)));
  const apiRouteFileByPath = new Map<string, string>();
  for (const f of files) {
    const routePath = apiRoutePathFromFile(path.normalize(f), rootPath);
    if (routePath) apiRouteFileByPath.set(routePath, path.normalize(f));
  }
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
      flags: computeElementFlags(sf, rel, role, framework),
    });

    const addEdge = (
      specifier: string,
      targetPath: string | undefined,
      typeOverride?: DependencyType,
    ) => {
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
        type:
          typeOverride ??
          classifyDependencyType({
            importSpecifier: specifier,
            sourceFilePath: normSource,
            targetFilePath: normTarget,
          }),
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

    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = unwrapExpression(call.getExpression());
      if (!isFetchCallee(callee)) continue;
      const firstArg = call.getArguments()[0];
      if (!firstArg) continue;
      const pathStr = tryGetApiPathStringFromNode(firstArg);
      const routeKey = resolveApiRoutePath(pathStr, apiRouteFileByPath);
      if (!routeKey) continue;
      const targetApiFile = apiRouteFileByPath.get(routeKey);
      if (!targetApiFile) continue;
      /** Distinct specifier per callsite — normalize alone would collapse all fetches to the same route. */
      const displayPath = normalizeApiPath(pathStr ?? routeKey) || routeKey;
      const specifier = `fetch:${displayPath}@${sf.getBaseName()}:${call.getStart()}`;
      addEdge(specifier, targetApiFile, "api");
    }
  }

  const fileDependencies: FileDependency[] = internalEdges.map((e) => ({
    id: shortId("fdep", [e.sourceFilePath, e.targetFilePath, e.importSpecifier]),
    sourceFilePath: e.sourceFilePath,
    targetFilePath: e.targetFilePath,
    type: e.type,
    importSpecifier: e.importSpecifier || undefined,
  }));

  return { fileDependencies, internalEdges, fileScanInfos, project };
}
