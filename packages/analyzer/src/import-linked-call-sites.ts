import path from "node:path";
import type { Identifier, ImportDeclaration, Project } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { FileDependency, ModuleImportCallSites, ImportCallSite } from "@archmap/graph-model";

const PER_NEIGHBOR_CAP = 10;
const OVERALL_CAP = 80;

function norm(p: string): string {
  return path.normalize(p);
}

function relFromRoot(rootPath: string, abs: string): string {
  return path.relative(rootPath, abs).replace(/\\/g, "/");
}

function buildCrossBoundaryLookup(deps: FileDependency[]): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const d of deps) {
    const k = `${norm(d.sourceFilePath)}\0${norm(d.targetFilePath)}`;
    m.set(k, Boolean(d.isCrossBoundary));
  }
  return m;
}

function isCrossBoundaryForFiles(
  lookup: Map<string, boolean>,
  sourceAbs: string,
  targetAbs: string,
): boolean {
  const k = `${norm(sourceAbs)}\0${norm(targetAbs)}`;
  if (lookup.has(k)) return lookup.get(k)!;
  return true;
}

interface RawEdge {
  callerModuleId: string;
  calleeModuleId: string;
  callerFileRel: string;
  calleeLabel: string;
  line: number;
  isCrossBoundary: boolean;
}

function compareSites(a: ImportCallSite, b: ImportCallSite): number {
  if (a.isCrossBoundary !== b.isCrossBoundary) return a.isCrossBoundary ? -1 : 1;
  const p = a.callerFilePath.localeCompare(b.callerFilePath);
  if (p !== 0) return p;
  if (a.line !== b.line) return a.line - b.line;
  return a.calleeLabel.localeCompare(b.calleeLabel);
}

function capByNeighborAndOverall(
  sites: ImportCallSite[],
  perNeighbor: number,
  overall: number,
): { kept: ImportCallSite[]; omitted: number } {
  const sorted = [...sites].sort(compareSites);
  const perNeighborCount = new Map<string, number>();
  const kept: ImportCallSite[] = [];
  for (const s of sorted) {
    if (kept.length >= overall) break;
    const n = perNeighborCount.get(s.otherModuleId) ?? 0;
    if (n >= perNeighbor) continue;
    kept.push(s);
    perNeighborCount.set(s.otherModuleId, n + 1);
  }
  return { kept, omitted: Math.max(0, sites.length - kept.length) };
}

function toOutboundSite(e: RawEdge): ImportCallSite {
  return {
    otherModuleId: e.calleeModuleId,
    callerFilePath: e.callerFileRel,
    calleeLabel: e.calleeLabel,
    line: e.line,
    isCrossBoundary: e.isCrossBoundary,
  };
}

function toInboundSite(e: RawEdge): ImportCallSite {
  return {
    otherModuleId: e.callerModuleId,
    callerFilePath: e.callerFileRel,
    calleeLabel: e.calleeLabel,
    line: e.line,
    isCrossBoundary: e.isCrossBoundary,
  };
}

function findImportDeclarationForIdentifier(ident: Identifier): ImportDeclaration | undefined {
  const symbol = ident.getSymbol();
  if (!symbol) return undefined;
  for (const decl of symbol.getDeclarations()) {
    let current: import("ts-morph").Node | undefined = decl;
    while (current) {
      if (Node.isImportDeclaration(current)) return current;
      current = current.getParent();
    }
  }
  return undefined;
}

function getCalleeRootIdentifier(callee: import("ts-morph").Node): Identifier | undefined {
  if (Node.isIdentifier(callee)) return callee;
  if (Node.isPropertyAccessExpression(callee)) {
    let cur: import("ts-morph").Node = callee;
    while (Node.isPropertyAccessExpression(cur)) {
      const inner = cur.getExpression();
      if (Node.isIdentifier(inner)) return inner;
      if (Node.isPropertyAccessExpression(inner)) {
        cur = inner;
        continue;
      }
      return undefined;
    }
  }
  return undefined;
}

function targetAbsFromImportDecl(decl: ImportDeclaration): string | undefined {
  const tsf = decl.getModuleSpecifierSourceFile();
  if (!tsf) return undefined;
  return norm(tsf.getFilePath());
}

export interface BuildModuleImportCallSitesInput {
  project: Project;
  rootPath: string;
  files: string[];
  fileToModuleId: Map<string, string>;
  fileDependencies: FileDependency[];
}

export function buildModuleImportCallSites(input: BuildModuleImportCallSitesInput): {
  moduleImportCallSites: Record<string, ModuleImportCallSites>;
} {
  const { project, rootPath, files, fileToModuleId, fileDependencies } = input;
  const crossLookup = buildCrossBoundaryLookup(fileDependencies);
  const rawEdges: RawEdge[] = [];
  const seenEdge = new Set<string>();

  const fileSet = new Set(files.map((f) => norm(f)));

  for (const fileAbs of files) {
    const normSource = norm(fileAbs);
    const callerMod = fileToModuleId.get(normSource);
    if (!callerMod) continue;
    const sf = project.getSourceFile(normSource);
    if (!sf) continue;
    const callerRel = relFromRoot(rootPath, normSource);

    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (Node.isSuperExpression(callee) || Node.isImportExpression(callee)) continue;

      const rootIdent = getCalleeRootIdentifier(callee);
      if (!rootIdent) continue;

      const impDecl = findImportDeclarationForIdentifier(rootIdent);
      if (!impDecl) continue;

      const targetAbs = targetAbsFromImportDecl(impDecl);
      if (!targetAbs || !fileSet.has(targetAbs)) continue;

      const calleeMod = fileToModuleId.get(targetAbs);
      if (!calleeMod || calleeMod === callerMod) continue;

      const calleeLabel = callee.getText();
      const line = call.getStartLineNumber();
      const isXB = isCrossBoundaryForFiles(crossLookup, normSource, targetAbs);
      const dedupeKey = `${callerMod}|${calleeMod}|${callerRel}|${line}|${calleeLabel}`;
      if (seenEdge.has(dedupeKey)) continue;
      seenEdge.add(dedupeKey);

      rawEdges.push({
        callerModuleId: callerMod,
        calleeModuleId: calleeMod,
        callerFileRel: callerRel,
        calleeLabel,
        line,
        isCrossBoundary: isXB,
      });
    }
  }

  const outboundByModule = new Map<string, RawEdge[]>();
  const inboundByModule = new Map<string, RawEdge[]>();
  for (const e of rawEdges) {
    const ob = outboundByModule.get(e.callerModuleId) ?? [];
    ob.push(e);
    outboundByModule.set(e.callerModuleId, ob);
    const ib = inboundByModule.get(e.calleeModuleId) ?? [];
    ib.push(e);
    inboundByModule.set(e.calleeModuleId, ib);
  }

  const moduleIds = new Set<string>([...outboundByModule.keys(), ...inboundByModule.keys()]);
  const moduleImportCallSites: Record<string, ModuleImportCallSites> = {};

  for (const mid of moduleIds) {
    const outboundRaw = outboundByModule.get(mid) ?? [];
    const inboundRaw = inboundByModule.get(mid) ?? [];
    const outboundAll = outboundRaw.map(toOutboundSite);
    const inboundAll = inboundRaw.map(toInboundSite);
    const outboundCap = capByNeighborAndOverall(outboundAll, PER_NEIGHBOR_CAP, OVERALL_CAP);
    const inboundCap = capByNeighborAndOverall(inboundAll, PER_NEIGHBOR_CAP, OVERALL_CAP);
    moduleImportCallSites[mid] = {
      outbound: outboundCap.kept,
      inbound: inboundCap.kept,
      outboundTotal: outboundAll.length,
      inboundTotal: inboundAll.length,
      outboundOmitted: outboundCap.omitted,
      inboundOmitted: inboundCap.omitted,
    };
  }

  return { moduleImportCallSites };
}
