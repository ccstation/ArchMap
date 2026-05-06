"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  ReactFlowProvider,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  MarkerType,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";

type GraphNode = {
  id: string;
  type: "module";
  name: string;
  /** Repo-relative file path from the graph API (file-level map). */
  relativeFilePath?: string;
  risk?: "low" | "medium" | "high";
  moduleId?: string;
  moduleLabel?: string;
  /** Directory cluster under the module folder ("Module root" for loose files). */
  groupId?: string;
  groupLabel?: string;
  /** Module-map zoom: import-linked call totals. */
  callSiteSummary?: string;
};

type ModuleCallSitePreview = {
  inboundTotal: number;
  outboundTotal: number;
  inboundLines: string[];
  outboundLines: string[];
};

type GraphResponse = {
  snapshotId: string;
  level: string;
  focusModuleId?: string;
  nodes: GraphNode[];
  edges: {
    id: string;
    source: string;
    target: string;
    type: string;
    strength?: number;
    evidenceCount?: number;
    evidenceDensity?: number;
  }[];
  moduleCallSitePreview?: Record<string, ModuleCallSitePreview>;
};

type ModuleListItem = {
  id: string;
  name: string;
  description?: string;
  confidence: number;
  moduleCandidateScore?: number;
  inboundCount: number;
  outboundCount: number;
  fileCount: number;
  violationCount: number;
};

type ModuleDetail = {
  id: string;
  name: string;
  description?: string;
  contents: { type: "file" | "symbol"; path: string; name?: string }[];
  publicSurface: string[];
  inboundDependencies: string[];
  outboundDependencies: string[];
  risks: { severity: string; message: string }[];
  aiSummary?: string;
  importCallSites: {
    outbound: {
      otherModuleId: string;
      callerFilePath: string;
      calleeLabel: string;
      line: number;
      isCrossBoundary: boolean;
    }[];
    inbound: {
      otherModuleId: string;
      callerFilePath: string;
      calleeLabel: string;
      line: number;
      isCrossBoundary: boolean;
    }[];
    outboundTotal: number;
    inboundTotal: number;
    outboundOmitted: number;
    inboundOmitted: number;
    outboundLines: string[];
    inboundLines: string[];
  };
};

type SeamRow = {
  id: string;
  fromModuleId: string;
  toModuleId: string;
  seamType: string;
  strength: number;
  evidenceCount: number;
};

type ViolationRow = {
  id: string;
  type: string;
  severity: string;
  message: string;
  moduleIds?: string[];
};

function riskColor(r?: string): string {
  if (r === "high") return "#ef4444";
  if (r === "medium") return "#f59e0b";
  return "#22c55e";
}

function cycleIdsFromViolations(items: ViolationRow[]): Set<string> {
  const s = new Set<string>();
  for (const v of items) {
    if (v.type === "circular-dependency" && v.moduleIds) {
      for (const id of v.moduleIds) s.add(id);
    }
  }
  return s;
}

const FILE_GROUP_PAD = 14;
const FILE_GROUP_HEADER = 30;
const FILE_CELL_W = 170;
const FILE_CELL_H = 88;
const FILE_GROUP_V_GAP = 24;
const FILE_MODULE_PAD = 18;
const FILE_MODULE_HEADER = 34;
const FILE_MODULE_V_GAP = 44;

function filePathKey(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Pick side handles so edges leave/arrive along the vector between file tiles (not forced vertical). */
function pickFileEdgeHandles(
  sourceId: string,
  targetId: string,
  nodeById: Map<string, Node>,
): { sourceHandle: string; targetHandle: string } | null {
  const a = nodeById.get(sourceId);
  const b = nodeById.get(targetId);
  if (a?.type !== "fileTile" || b?.type !== "fileTile") return null;
  const aw =
    typeof a.style?.width === "number" ? a.style.width : FILE_CELL_W - 6;
  const bw =
    typeof b.style?.width === "number" ? b.style.width : FILE_CELL_W - 6;
  const ap = a.position;
  const bp = b.position;
  const scx = ap.x + aw / 2;
  const scy = ap.y + FILE_CELL_H / 2;
  const tcx = bp.x + bw / 2;
  const tcy = bp.y + FILE_CELL_H / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;
  let sSide: "top" | "right" | "bottom" | "left";
  let tSide: "top" | "right" | "bottom" | "left";
  if (Math.abs(dx) >= Math.abs(dy)) {
    sSide = dx >= 0 ? "right" : "left";
    tSide = dx >= 0 ? "left" : "right";
  } else {
    sSide = dy >= 0 ? "bottom" : "top";
    tSide = dy >= 0 ? "top" : "bottom";
  }
  return { sourceHandle: `src-${sSide}`, targetHandle: `tgt-${tSide}` };
}

/** Route list: App Router `page` entry files only (not layout/route). */
function isAppRouterPageFile(relPath: string): boolean {
  const lower = relPath.replace(/\\/g, "/").toLowerCase();
  return (
    /(^|\/)app\/.*\/page\.(m|c)?(t|j)sx?$/.test(lower) ||
    /(^|\/)src\/app\/.*\/page\.(m|c)?(t|j)sx?$/.test(lower)
  );
}

function isPagesRouterPageFile(relPath: string): boolean {
  const lower = relPath.replace(/\\/g, "/").toLowerCase();
  if (!/(^|\/)pages\//.test(lower)) return false;
  const seg = lower.split("/").pop() ?? "";
  if (/^_(app|document)\.(m|c)?(t|j)sx?$/.test(seg)) return false;
  return /\.(m|c)?(t|j)sx?$/.test(lower);
}

function isRoutePageListFile(relPath: string): boolean {
  return isAppRouterPageFile(relPath) || isPagesRouterPageFile(relPath);
}

interface RouteTreeDir {
  kind: "dir";
  segment: string;
  /** Path from repo root through this segment (no trailing slash). */
  fullPrefix: string;
  children: RouteTreeNode[];
}

interface RouteTreeFile {
  kind: "file";
  segment: string;
  relPath: string;
  absId: string;
  moduleLabel?: string;
}

type RouteTreeNode = RouteTreeDir | RouteTreeFile;

function insertRoutePageIntoTree(
  root: RouteTreeDir,
  relPath: string,
  absId: string,
  moduleLabel?: string,
): void {
  const parts = filePathKey(relPath).split("/").filter(Boolean);
  if (parts.length === 0) return;
  let current = root;
  let pathSoFar = "";
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    const isLast = i === parts.length - 1;
    pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
    if (isLast) {
      current.children.push({
        kind: "file",
        segment: seg,
        relPath: filePathKey(relPath),
        absId,
        moduleLabel,
      });
      return;
    }
    let dir = current.children.find(
      (c): c is RouteTreeDir => c.kind === "dir" && c.segment === seg,
    );
    if (!dir) {
      dir = { kind: "dir", segment: seg, fullPrefix: pathSoFar, children: [] };
      current.children.push(dir);
    }
    current = dir;
  }
}

function sortRouteTreeNodes(nodes: RouteTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.segment.localeCompare(b.segment);
  });
  for (const n of nodes) {
    if (n.kind === "dir") sortRouteTreeNodes(n.children);
  }
}

function filterRouteTreeBySubstring(nodes: RouteTreeNode[], needle: string): RouteTreeNode[] {
  const q = needle.trim().toLowerCase();
  if (!q) return nodes;
  const out: RouteTreeNode[] = [];
  for (const n of nodes) {
    if (n.kind === "file") {
      if (n.relPath.toLowerCase().includes(q)) out.push(n);
    } else {
      const ch = filterRouteTreeBySubstring(n.children, q);
      if (ch.length) out.push({ ...n, children: ch });
    }
  }
  return out;
}

function collectAllDirPrefixesInTree(nodes: RouteTreeNode[]): string[] {
  const out: string[] = [];
  function walk(ns: RouteTreeNode[]) {
    for (const n of ns) {
      if (n.kind === "dir") {
        out.push(n.fullPrefix);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return out;
}

function countPagesInRouteSubtree(nodes: RouteTreeNode[]): number {
  let c = 0;
  for (const n of nodes) {
    if (n.kind === "file") c++;
    else c += countPagesInRouteSubtree(n.children);
  }
  return c;
}

function routePathPrefixesForFile(relPath: string): string[] {
  const parts = filePathKey(relPath).split("/").filter(Boolean);
  const prefixes: string[] = [];
  let acc = "";
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i]!;
    prefixes.push(acc);
  }
  return prefixes;
}

function RouteFolderTree({
  nodes,
  depth,
  selectedAbs,
  expandedPrefixes,
  onToggleDir,
  onSelectFile,
}: {
  nodes: RouteTreeNode[];
  depth: number;
  selectedAbs: string | null;
  expandedPrefixes: Set<string>;
  onToggleDir: (fullPrefix: string) => void;
  onSelectFile: (absId: string) => void;
}) {
  return (
    <ul className={depth > 0 ? "ml-2 border-l border-zinc-100 pl-2" : ""}>
      {nodes.map((n) => {
        if (n.kind === "dir") {
          const pageCount = countPagesInRouteSubtree(n.children);
          return (
            <li key={n.fullPrefix || `root-${n.segment}`} className="py-0.5">
              <button
                type="button"
                className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] text-zinc-800 hover:bg-zinc-100"
                onClick={() => onToggleDir(n.fullPrefix)}
              >
                <span className="w-3 shrink-0 font-mono text-zinc-400">
                  {expandedPrefixes.has(n.fullPrefix) ? "▾" : "▸"}
                </span>
                <span className="min-w-0 truncate font-medium">{n.segment || "·"}</span>
                <span className="shrink-0 text-[10px] text-zinc-400">
                  · {pageCount} page{pageCount === 1 ? "" : "s"}
                </span>
              </button>
              {expandedPrefixes.has(n.fullPrefix) ? (
                <RouteFolderTree
                  nodes={n.children}
                  depth={depth + 1}
                  selectedAbs={selectedAbs}
                  expandedPrefixes={expandedPrefixes}
                  onToggleDir={onToggleDir}
                  onSelectFile={onSelectFile}
                />
              ) : null}
            </li>
          );
        }
        return (
          <li key={n.absId} className="py-0.5">
            <div
              className={`rounded border px-1.5 py-1 ${
                selectedAbs && filePathKey(selectedAbs) === filePathKey(n.absId)
                  ? "border-blue-200 bg-blue-50"
                  : "border-transparent bg-transparent"
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelectFile(n.absId)}
              >
                <div className="font-mono text-[11px] font-semibold text-zinc-900">{n.segment}</div>
                {n.moduleLabel ? (
                  <div className="truncate text-[10px] text-zinc-500" title={n.relPath}>
                    {n.moduleLabel}
                  </div>
                ) : (
                  <div className="truncate font-mono text-[10px] text-zinc-500" title={n.relPath}>
                    {compactRepoPath(n.relPath, 44)}
                  </div>
                )}
              </button>
              <details className="mt-0.5 text-[10px] text-zinc-500">
                <summary className="cursor-pointer select-none text-zinc-400 hover:text-zinc-700">
                  Details
                </summary>
                <div className="mt-1 space-y-0.5 border-t border-zinc-100 pt-1 font-mono text-[10px] leading-snug text-zinc-600">
                  {n.moduleLabel ? (
                    <div>
                      <span className="text-zinc-400">Module</span> {n.moduleLabel}
                    </div>
                  ) : null}
                  <div className="break-all">{n.relPath}</div>
                </div>
              </details>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function buildRouteFileSubgraph(
  full: GraphResponse,
  rootAbs: string,
  globalDepth: number,
  expandedNodes: Set<string>,
): GraphResponse {
  const isRouteDependencyEdge = (type?: string) => type === "import" || type === "api";
  const rootK = filePathKey(rootAbs);
  const idK = (id: string) => filePathKey(id);
  const nodeByKey = new Map<string, GraphNode>();
  for (const n of full.nodes) {
    nodeByKey.set(idK(n.id), n);
  }
  if (!nodeByKey.has(rootK)) {
    return {
      snapshotId: full.snapshotId,
      level: "file",
      nodes: [],
      edges: [],
    };
  }
  const allKeys = new Set(nodeByKey.keys());
  const outAdj = new Map<string, string[]>();
  for (const e of full.edges) {
    if (!isRouteDependencyEdge(e.type)) continue;
    const s = idK(e.source);
    const t = idK(e.target);
    if (!allKeys.has(s) || !allKeys.has(t)) continue;
    const arr = outAdj.get(s) ?? [];
    arr.push(t);
    outAdj.set(s, arr);
  }
  const dist = new Map<string, number>();
  dist.set(rootK, 0);
  const q: string[] = [rootK];
  while (q.length) {
    const u = q.shift()!;
    const du = dist.get(u) ?? 0;
    for (const v of outAdj.get(u) ?? []) {
      if (dist.has(v)) continue;
      const nv = du + 1;
      if (nv > globalDepth) continue;
      dist.set(v, nv);
      q.push(v);
    }
  }
  const visible = new Set<string>(dist.keys());
  for (const ex of expandedNodes) {
    const ek = idK(ex);
    if (!nodeByKey.has(ek)) continue;
    for (const v of outAdj.get(ek) ?? []) {
      visible.add(v);
    }
  }
  const visibleOrigIds = new Set<string>();
  for (const k of visible) {
    visibleOrigIds.add(nodeByKey.get(k)!.id);
  }
  const nodes = full.nodes.filter((n) => visibleOrigIds.has(n.id));
  const nodeKeySet = new Set([...visible]);
  const edges = full.edges.filter((e) => {
    if (!isRouteDependencyEdge(e.type)) return false;
    return nodeKeySet.has(idK(e.source)) && nodeKeySet.has(idK(e.target));
  });
  return {
    snapshotId: full.snapshotId,
    level: "file",
    focusModuleId: full.focusModuleId,
    nodes,
    edges,
    moduleCallSitePreview: full.moduleCallSitePreview,
  };
}

function compactRepoPath(filePath: string, maxLen = 52): string {
  const p = filePath.replace(/\\/g, "/");
  if (p.length <= maxLen) return p;
  return `…${p.slice(-(maxLen - 1))}`;
}

/** Vertical import layers: importers above importees (source → target = arrow down). */
function importLayersForFiles(
  fileIds: string[],
  edges: { source: string; target: string }[],
): Map<string, number> {
  const ids = new Set(fileIds);
  const preds = new Map<string, string[]>();
  for (const id of fileIds) preds.set(id, []);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    preds.get(e.target)!.push(e.source);
  }
  const layer = new Map<string, number>();
  for (const id of fileIds) layer.set(id, 0);
  const iters = Math.max(fileIds.length + 2, 8);
  for (let i = 0; i < iters; i++) {
    for (const id of fileIds) {
      let L = 0;
      for (const p of preds.get(id) ?? []) {
        if (ids.has(p)) L = Math.max(L, (layer.get(p) ?? 0) + 1);
      }
      layer.set(id, L);
    }
  }
  return layer;
}

/** Flat route canvas: root page at top, each import hop one row down (BFS from root along import edges). */
function layoutFlatImportGraphFromRoot(
  gn: GraphNode[],
  edges: { source: string; target: string; type?: string }[],
  rootId: string,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const rootKey = filePathKey(rootId);
  const rootNode = gn.find((n) => filePathKey(n.id) === rootKey);

  if (!rootNode || gn.length === 0) {
    gn.forEach((n, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      pos.set(n.id, { x: 40 + col * 200, y: 40 + row * 100 });
    });
    return pos;
  }

  const ids = new Set(gn.map((n) => n.id));
  const importEdges = edges.filter((e) => e.type === "import" || e.type === "api");
  const outAdj = new Map<string, string[]>();
  for (const id of ids) outAdj.set(id, []);
  for (const e of importEdges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    outAdj.get(e.source)!.push(e.target);
  }

  const depth = new Map<string, number>();
  depth.set(rootNode.id, 0);
  const q: string[] = [rootNode.id];
  while (q.length) {
    const u = q.shift()!;
    const du = depth.get(u)!;
    for (const v of outAdj.get(u) ?? []) {
      const nd = du + 1;
      if (!depth.has(v) || nd < depth.get(v)!) {
        depth.set(v, nd);
        q.push(v);
      }
    }
  }

  let maxReachable = 0;
  for (const n of gn) {
    if (depth.has(n.id)) maxReachable = Math.max(maxReachable, depth.get(n.id)!);
  }
  for (const n of gn) {
    if (!depth.has(n.id)) depth.set(n.id, maxReachable + 1);
  }

  const byDepth = new Map<number, GraphNode[]>();
  for (const n of gn) {
    const d = depth.get(n.id)!;
    const arr = byDepth.get(d) ?? [];
    arr.push(n);
    byDepth.set(d, arr);
  }
  for (const arr of byDepth.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

  const depthKeys = [...byDepth.keys()].sort((a, b) => a - b);
  let maxRowLen = 1;
  for (const d of depthKeys) {
    maxRowLen = Math.max(maxRowLen, byDepth.get(d)!.length);
  }
  const canvasInnerW = maxRowLen * FILE_CELL_W;
  const PAD_X = 48;
  const PAD_Y = 40;

  for (const d of depthKeys) {
    const row = byDepth.get(d)!;
    const rowW = row.length * FILE_CELL_W;
    const rowStartX = PAD_X + Math.max(0, (canvasInnerW - rowW) / 2);
    row.forEach((n, i) => {
      pos.set(n.id, {
        x: rowStartX + i * FILE_CELL_W,
        y: PAD_Y + d * FILE_CELL_H,
      });
    });
  }

  return pos;
}

function layoutFileGraphWithGroups(
  gn: GraphNode[],
  edges: { source: string; target: string }[],
  moduleCallSitePreview?: Record<string, ModuleCallSitePreview>,
): Node[] {
  const byModule = new Map<string, GraphNode[]>();
  for (const n of gn) {
    const moduleId = n.moduleId ?? "__unknown_module__";
    const arr = byModule.get(moduleId) ?? [];
    arr.push(n);
    byModule.set(moduleId, arr);
  }

  const moduleEntries = [...byModule.entries()].sort((a, b) => {
    const la = a[1][0]?.moduleLabel ?? a[0];
    const lb = b[1][0]?.moduleLabel ?? b[0];
    return la.localeCompare(lb);
  });

  const frames: Node[] = [];
  const files: Node[] = [];
  let yCursor = 24;
  const x0 = 28;

  for (const [moduleId, moduleFiles] of moduleEntries) {
    const byDirectory = new Map<string, GraphNode[]>();
    for (const file of moduleFiles) {
      const groupId = file.groupId ?? `grp:${moduleId}:__root__`;
      const arr = byDirectory.get(groupId) ?? [];
      arr.push(file);
      byDirectory.set(groupId, arr);
    }
    const directoryEntries = [...byDirectory.entries()].sort((a, b) => {
      const la = a[1][0]?.groupLabel ?? a[0];
      const lb = b[1][0]?.groupLabel ?? b[0];
      if (la === "Module root") return -1;
      if (lb === "Module root") return 1;
      return la.localeCompare(lb);
    });

    let directoryYOffset = FILE_MODULE_HEADER + FILE_MODULE_PAD;
    let moduleInnerMaxWidth = 0;
    const moduleLabel = moduleFiles[0]?.moduleLabel ?? moduleId;
    const p = moduleCallSitePreview?.[moduleId];
    const lineCount = (p?.outboundLines?.length ?? 0) + (p?.inboundLines?.length ?? 0);
    const callBlockExtra =
      moduleCallSitePreview === undefined
        ? 0
        : p === undefined
          ? 0
          : lineCount > 0
            ? Math.min(200, 52 + Math.min(lineCount, 16) * 15)
            : (p.inboundTotal ?? 0) + (p.outboundTotal ?? 0) > 0
              ? 36
              : 0;

    for (const [directoryGroupId, directoryFiles] of directoryEntries) {
      const fileIds = directoryFiles.map((f) => f.id);
      const layerById = importLayersForFiles(fileIds, edges);
      const layerToFiles = new Map<number, GraphNode[]>();
      let maxLayer = 0;
      for (const file of directoryFiles) {
        const L = layerById.get(file.id) ?? 0;
        maxLayer = Math.max(maxLayer, L);
        const arr = layerToFiles.get(L) ?? [];
        arr.push(file);
        layerToFiles.set(L, arr);
      }
      const rows: GraphNode[][] = [];
      for (let L = 0; L <= maxLayer; L++) {
        const row = [...(layerToFiles.get(L) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
        if (row.length) rows.push(row);
      }
      if (!rows.length) rows.push([...directoryFiles].sort((a, b) => a.name.localeCompare(b.name)));

      const maxRowLen = Math.max(...rows.map((r) => r.length), 1);
      const directoryFrameW = FILE_GROUP_PAD * 2 + maxRowLen * FILE_CELL_W;
      const directoryFrameH =
        FILE_GROUP_HEADER + FILE_GROUP_PAD * 2 + Math.max(rows.length, 1) * FILE_CELL_H;
      const directoryFrameX = x0 + FILE_MODULE_PAD;
      const directoryFrameY = yCursor + directoryYOffset;

      frames.push({
        id: `frame:${directoryGroupId}`,
        type: "groupFrame",
        position: { x: directoryFrameX, y: directoryFrameY },
        draggable: false,
        selectable: false,
        focusable: false,
        data: { label: directoryFiles[0]?.groupLabel ?? directoryGroupId, tone: "directory" },
        style: {
          width: directoryFrameW,
          height: directoryFrameH,
          zIndex: 1,
        },
      });

      rows.forEach((rowFiles, rowIndex) => {
        const rowW = rowFiles.length * FILE_CELL_W;
        const innerW = directoryFrameW - FILE_GROUP_PAD * 2;
        const rowStartX =
          directoryFrameX + FILE_GROUP_PAD + Math.max(0, (innerW - rowW) / 2);
        rowFiles.forEach((file, colIndex) => {
          const subtitle = file.relativeFilePath
            ? compactRepoPath(file.relativeFilePath)
            : undefined;
          files.push({
            id: file.id,
            type: "fileTile",
            position: {
              x: rowStartX + colIndex * FILE_CELL_W,
              y: directoryFrameY + FILE_GROUP_HEADER + FILE_GROUP_PAD + rowIndex * FILE_CELL_H,
            },
            data: {
              label: file.name,
              subtitle,
              pathTitle: file.relativeFilePath?.replace(/\\/g, "/"),
              risk: file.risk,
            },
            style: {
              width: FILE_CELL_W - 6,
              zIndex: 2,
            },
          });
        });
      });

      directoryYOffset += directoryFrameH + FILE_GROUP_V_GAP;
      moduleInnerMaxWidth = Math.max(moduleInnerMaxWidth, directoryFrameW);
    }

    const moduleFrameWidth = FILE_MODULE_PAD * 2 + moduleInnerMaxWidth;
    const moduleFrameHeight =
      directoryYOffset + FILE_MODULE_PAD - FILE_GROUP_V_GAP + callBlockExtra;
    frames.push({
      id: `frame:module:${moduleId}`,
      type: "groupFrame",
      position: { x: x0, y: yCursor },
      draggable: false,
      selectable: false,
      focusable: false,
      data: {
        label: moduleLabel,
        tone: "module" as const,
        ...(p &&
        ((p.outboundLines?.length ?? 0) + (p.inboundLines?.length ?? 0) > 0 ||
          (p.inboundTotal ?? 0) + (p.outboundTotal ?? 0) > 0)
          ? {
              inboundTotal: p.inboundTotal,
              outboundTotal: p.outboundTotal,
              inboundLines: p.inboundLines,
              outboundLines: p.outboundLines,
            }
          : {}),
      },
      style: {
        width: moduleFrameWidth,
        height: moduleFrameHeight,
        zIndex: 0,
      },
    });

    yCursor += moduleFrameHeight + FILE_MODULE_V_GAP;
  }

  return [...frames, ...files];
}

function FileTileNode({
  data,
}: NodeProps<{
  label: string;
  subtitle?: string;
  pathTitle?: string;
  risk?: "low" | "medium" | "high";
  isApiDependencyNode?: boolean;
}>) {
  return (
    <div
      className="relative rounded-lg border-2 bg-[#fafafa] px-1.5 py-1 shadow-sm"
      style={{
        borderColor: data.isApiDependencyNode ? "#0f766e" : riskColor(data.risk),
        background: data.isApiDependencyNode ? "#f0fdfa" : "#fafafa",
        maxWidth: FILE_CELL_W - 10,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="tgt-top"
        className="!h-2 !w-2 !border-0 !bg-slate-500"
        aria-label="Import target"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="tgt-right"
        className="!h-2 !w-2 !border-0 !bg-slate-500"
        style={{ top: "50%" }}
        aria-label="Import target"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="tgt-bottom"
        className="!h-2 !w-2 !border-0 !bg-slate-500"
        aria-label="Import target"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="tgt-left"
        className="!h-2 !w-2 !border-0 !bg-slate-500"
        style={{ top: "50%" }}
        aria-label="Import target"
      />
      <div className="truncate text-[11px] font-semibold leading-tight text-zinc-900">{data.label}</div>
      {data.subtitle ? (
        <div
          className="mt-0.5 truncate font-mono text-[9px] leading-tight text-zinc-500"
          title={data.pathTitle ?? data.subtitle}
        >
          {data.subtitle}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Top}
        id="src-top"
        className="!h-2 !w-2 !border-0 !bg-slate-500"
        aria-label="Import source"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="src-right"
        className="!h-2 !w-2 !border-0 !bg-slate-500"
        style={{ top: "50%" }}
        aria-label="Import source"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="src-bottom"
        className="!h-2 !w-2 !border-0 !bg-slate-500"
        aria-label="Import source"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="src-left"
        className="!h-2 !w-2 !border-0 !bg-slate-500"
        style={{ top: "50%" }}
        aria-label="Import source"
      />
    </div>
  );
}

function GroupFrameNode({
  data,
}: NodeProps<{
  label: string;
  tone?: "module" | "directory";
  inboundTotal?: number;
  outboundTotal?: number;
  inboundLines?: string[];
  outboundLines?: string[];
}>) {
  const isModuleFrame = data.tone === "module";
  const showCallPanel =
    isModuleFrame &&
    ((data.inboundTotal ?? 0) > 0 ||
      (data.outboundTotal ?? 0) > 0 ||
      (data.inboundLines?.length ?? 0) > 0 ||
      (data.outboundLines?.length ?? 0) > 0);
  return (
    <div
      className={`pointer-events-none flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-sm ${
        isModuleFrame
          ? "border-zinc-300 bg-zinc-100/95"
          : "border-dashed border-zinc-300 bg-zinc-50/95"
      }`}
    >
      <div
        className={`shrink-0 border-b px-2 py-1.5 text-xs font-semibold ${
          isModuleFrame
            ? "border-zinc-300 bg-zinc-300/90 text-zinc-800"
            : "border-zinc-200 bg-zinc-200/90 text-zinc-700"
        }`}
      >
        {data.label}
      </div>
      {showCallPanel ? (
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-1.5 pb-1 pt-0.5 text-[10px] text-zinc-600">
          <div className="shrink-0 font-medium text-zinc-700">
            Import-linked calls: {data.inboundTotal ?? 0} in · {data.outboundTotal ?? 0} out
          </div>
          {(data.outboundLines?.length ?? 0) + (data.inboundLines?.length ?? 0) > 0 ? (
            <ul className="min-h-0 flex-1 list-none space-y-0.5 overflow-y-auto font-mono leading-tight text-zinc-600">
              {data.outboundLines?.map((line, i) => (
                <li key={`o-${i}`} className="truncate" title={line}>
                  ↗ {line}
                </li>
              ))}
              {data.inboundLines?.map((line, i) => (
                <li key={`i-${i}`} className="truncate" title={line}>
                  ↙ {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1 bg-transparent" aria-hidden />
      )}
    </div>
  );
}

function ModuleTileNode({
  data,
}: NodeProps<{ label: string; subtitle?: string; risk?: string; inCycle?: boolean }>) {
  const border = data.inCycle
    ? "border-red-500"
    : data.risk === "high"
      ? "border-red-400"
      : data.risk === "medium"
        ? "border-amber-400"
        : "border-emerald-500/80";
  return (
    <div
      className={`rounded-lg border-2 bg-white px-3 py-2 shadow-sm ${border} min-w-[150px] max-w-[220px]`}
    >
      <div className="text-sm font-semibold text-zinc-900">{data.label}</div>
      {data.subtitle ? (
        <div className="mt-0.5 text-[10px] leading-tight text-zinc-500">{data.subtitle}</div>
      ) : null}
    </div>
  );
}

const archMapNodeTypes = {
  groupFrame: GroupFrameNode,
  moduleTile: ModuleTileNode,
  fileTile: FileTileNode,
};

const NODE_POSITION_STORAGE_KEY = "archmap.node-positions.v1";
const SURFACE_STORAGE_KEY = "archmap.surface.v1";
const ROUTE_DIR_EXPANDED_STORAGE_KEY = "archmap.route-dir-expanded.v1";

function readPersistedSurface(): "architecture" | "routes" {
  if (typeof window === "undefined") return "architecture";
  try {
    const value = window.localStorage.getItem(SURFACE_STORAGE_KEY);
    return value === "routes" ? "routes" : "architecture";
  } catch {
    return "architecture";
  }
}

function readPersistedRouteDirExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ROUTE_DIR_EXPANDED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const prefixes = parsed.filter((item): item is string => typeof item === "string");
    return new Set(prefixes);
  } catch {
    return new Set();
  }
}

function readPersistedNodePositions(layoutKey: string): Map<string, { x: number; y: number }> {
  if (!layoutKey || typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(NODE_POSITION_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, Record<string, { x: number; y: number }>>;
    const byNodeId = parsed[layoutKey];
    if (!byNodeId) return new Map();
    return new Map(Object.entries(byNodeId));
  } catch {
    return new Map();
  }
}

function persistNodePositions(layoutKey: string, nodes: Node[]): void {
  if (!layoutKey || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(NODE_POSITION_STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, Record<string, { x: number; y: number }>>)
      : {};
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) positions[node.id] = node.position;
    parsed[layoutKey] = positions;
    window.localStorage.setItem(NODE_POSITION_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage failures; flow should still work with in-memory positions.
  }
}

function GraphFitView({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 250 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitKey, fitView]);
  return null;
}

function ArchMapFlow({
  rawGraph,
  violations,
  edgeFilter,
  selectedFilePath,
  onNodeClick,
  onNodeDoubleClick,
  forceFlatFileLayout = false,
  flatLayoutRootId = null,
  fitKeySuffix = "",
}: {
  rawGraph: GraphResponse | null;
  violations: ViolationRow[];
  edgeFilter: string;
  /** Absolute path of the clicked file in file-level view; used to emphasize import edges. */
  selectedFilePath: string | null;
  onNodeClick: (e: React.MouseEvent, n: Node) => void;
  onNodeDoubleClick: (e: React.MouseEvent, n: Node) => void;
  /** When true at file level, skip module/directory frames (e.g. route dependency subgraph). */
  forceFlatFileLayout?: boolean;
  /** Selected route page path: flat layout stacks nodes top-down from this root. */
  flatLayoutRootId?: string | null;
  /** Appended to auto fit-view key (e.g. route selection + depth). */
  fitKeySuffix?: string;
}) {
  const cycleIds = useMemo(() => cycleIdsFromViolations(violations), [violations]);
  const isModuleGraph = rawGraph?.level === "module";
  const useFileGroups =
    rawGraph?.level === "file" &&
    Boolean(rawGraph?.nodes.some((n) => n.moduleId)) &&
    !forceFlatFileLayout;
  const layoutKey = `${rawGraph?.snapshotId ?? ""}-${rawGraph?.level ?? ""}-${rawGraph?.focusModuleId ?? ""}-${forceFlatFileLayout ? "flat" : "grouped"}-${flatLayoutRootId ?? ""}`;
  const [positionStorageVersion, setPositionStorageVersion] = useState(0);
  const persistedPositions = useMemo(
    () => readPersistedNodePositions(layoutKey),
    [layoutKey, positionStorageVersion],
  );

  const baseNodes = useMemo<Node[]>(() => {
    if (!rawGraph) return [] as Node[];
    const { nodes: gn, edges: ge } = rawGraph;
    const moduleCallSitePreview = rawGraph.moduleCallSitePreview;
    const apiNodeIds = new Set<string>();
    for (const edge of ge) {
      if (edge.type !== "api") continue;
      apiNodeIds.add(edge.source);
      apiNodeIds.add(edge.target);
    }

    let rfNodes: Node[];
    if (useFileGroups) {
      rfNodes = layoutFileGraphWithGroups(gn, ge, moduleCallSitePreview);
    } else {
      const pos = new Map<string, { x: number; y: number }>();
      const flatRoot =
        forceFlatFileLayout && rawGraph.level === "file" ? flatLayoutRootId : null;
      const isRouteLikeFlat = Boolean(flatRoot);
      if (flatRoot) {
        const layoutPos = layoutFlatImportGraphFromRoot(gn, ge, flatRoot);
        for (const n of gn) {
          pos.set(n.id, layoutPos.get(n.id) ?? { x: 0, y: 0 });
        }
      } else {
        const cellX = isModuleGraph ? 220 : 180;
        const cellY = isModuleGraph ? 120 : 90;
        gn.forEach((n, i) => {
          const col = i % 6;
          const row = Math.floor(i / 6);
          pos.set(n.id, { x: col * cellX, y: row * cellY });
        });
      }

      rfNodes = gn.map((n) => ({
        id: n.id,
        type: isModuleGraph
          ? ("moduleTile" as const)
          : isRouteLikeFlat
            ? ("fileTile" as const)
            : undefined,
        position: pos.get(n.id) ?? { x: 0, y: 0 },
        data: isModuleGraph
          ? {
              label: n.name,
              subtitle: n.callSiteSummary,
              risk: n.risk,
              inCycle: cycleIds.has(n.id),
            }
          : isRouteLikeFlat
            ? {
                label: n.name,
                subtitle: n.relativeFilePath ? compactRepoPath(n.relativeFilePath) : undefined,
                pathTitle: n.relativeFilePath?.replace(/\\/g, "/"),
                risk: n.risk,
                isApiDependencyNode: apiNodeIds.has(n.id),
              }
            : { label: n.name },
        style: isModuleGraph
          ? { zIndex: 1 }
          : isRouteLikeFlat
            ? { width: FILE_CELL_W - 6, zIndex: 2 }
            : {
                border:
                  isModuleGraph && cycleIds.has(n.id)
                    ? "2px solid #ef4444"
                    : `2px solid ${riskColor(n.risk)}`,
                borderRadius: 8,
                padding: isModuleGraph ? 8 : 6,
                fontSize: isModuleGraph ? 13 : 11,
                maxWidth: isModuleGraph ? undefined : 160,
                background: "#fafafa",
              },
      }));
    }
    if (persistedPositions.size > 0) {
      rfNodes = rfNodes.map((node) => {
        const persisted = persistedPositions.get(node.id);
        return persisted ? { ...node, position: persisted } : node;
      });
    }
    return rfNodes;
  }, [
    rawGraph,
    cycleIds,
    isModuleGraph,
    useFileGroups,
    forceFlatFileLayout,
    flatLayoutRootId,
    persistedPositions,
  ]);

  const initialEdges = useMemo<Edge[]>(() => {
    if (!rawGraph) return [] as Edge[];
    const ge = rawGraph.edges;
    const isFileLevel = rawGraph.level === "file";
    const sel = selectedFilePath ? filePathKey(selectedFilePath) : null;
    const FILE_EDGE_STROKE = "#0f172a";
    const FILE_EDGE_WIDTH = 2.5;
    const nodeById = new Map(baseNodes.map((n) => [n.id, n]));
    const rfEdges: Edge[] = ge
      .filter((e) => edgeFilter === "all" || e.type === edgeFilter)
      .map((e) => {
        const srcK = filePathKey(e.source);
        const tgtK = filePathKey(e.target);
        const isImport = e.type === "import";
        const isApiDependency = e.type === "api";
        const touchesSelection =
          isFileLevel && sel && isImport && (srcK === sel || tgtK === sel);
        const isOutgoingFromSelection = isFileLevel && sel && srcK === sel && isImport;
        /** Keep edges above large group-frame nodes (frames use zIndex 0–1, files 2). */
        const fileEdgeZ = isOutgoingFromSelection ? 12 : touchesSelection ? 10 : 6;
        const fileHandles =
          isFileLevel ? pickFileEdgeHandles(e.source, e.target, nodeById) : null;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label:
            isModuleGraph && typeof e.evidenceCount === "number"
              ? `${e.type} · ev ${e.evidenceCount}`
              : isFileLevel
                ? undefined
                : e.type,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            orient: "auto",
            width: isFileLevel ? 14 : 12,
            height: isFileLevel ? 14 : 12,
            ...(isFileLevel
              ? {
                  color: isOutgoingFromSelection ? "#1d4ed8" : FILE_EDGE_STROKE,
                }
              : isApiDependency
                ? { color: "#0f766e" }
              : {}),
          },
          ...(isFileLevel
            ? fileHandles
              ? {
                  sourceHandle: fileHandles.sourceHandle,
                  targetHandle: fileHandles.targetHandle,
                }
              : { sourcePosition: Position.Bottom, targetPosition: Position.Top }
            : {}),
          zIndex: isFileLevel ? fileEdgeZ : touchesSelection ? 3 : undefined,
          style: isModuleGraph
            ? {
                stroke: isApiDependency
                  ? `rgba(15, 118, 110, ${0.35 + (e.evidenceDensity ?? 0) * 0.65})`
                  : `rgba(71, 85, 105, ${0.3 + (e.evidenceDensity ?? 0) * 0.7})`,
                strokeWidth: 1 + (e.strength ?? 0) * 4,
              }
            : isFileLevel
              ? isOutgoingFromSelection
                ? {
                    stroke: "#1d4ed8",
                    strokeWidth: 3.5,
                    opacity: 1,
                  }
                : {
                    stroke: FILE_EDGE_STROKE,
                    strokeWidth: FILE_EDGE_WIDTH,
                    opacity: 1,
                  }
              : {
                  stroke: "#94a3b8",
                  strokeWidth: 1,
                  opacity: 0.75,
                },
        };
      });
    return rfEdges;
  }, [
    rawGraph,
    edgeFilter,
    isModuleGraph,
    selectedFilePath,
    baseNodes,
  ]);

  const [nodes, setNodes] = useNodesState<Node>(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    setNodes(baseNodes);
  }, [baseNodes, setNodes]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
    },
    [setNodes],
  );
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent | TouchEvent, draggedNode: Node) => {
      const nextNodes = nodesRef.current.map((node) =>
        node.id === draggedNode.id ? { ...node, position: draggedNode.position } : node,
      );
      persistNodePositions(layoutKey, nextNodes);
      setPositionStorageVersion((v) => v + 1);
    },
    [layoutKey],
  );

  const fitKey = `${rawGraph?.snapshotId ?? ""}-${rawGraph?.level ?? ""}-${rawGraph?.focusModuleId ?? ""}${fitKeySuffix}`;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={archMapNodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onNodeDragStop={onNodeDragStop}
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <GraphFitView fitKey={fitKey} />
      <Background />
      <MiniMap />
      <Controls />
    </ReactFlow>
  );
}

export function ArchMapApp() {
  type GraphView =
    | { kind: "module" }
    | { kind: "all-files" }
    | { kind: "module-files"; moduleId: string };

  const [aiBusy, setAiBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repositoryId, setRepositoryId] = useState<string | null>(null);

  const [rawGraph, setRawGraph] = useState<GraphResponse | null>(null);
  const [modules, setModules] = useState<ModuleListItem[]>([]);
  const [seams, setSeams] = useState<SeamRow[]>([]);
  const [violations, setViolations] = useState<ViolationRow[]>([]);

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileDrillModuleId, setFileDrillModuleId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [tab, setTab] = useState<"module" | "seams" | "violations">("module");
  const [edgeFilter, setEdgeFilter] = useState<string>("all");

  const [surface, setSurface] = useState<"architecture" | "routes">(() => readPersistedSurface());
  const [routesBaseline, setRoutesBaseline] = useState<GraphResponse | null>(null);
  const [routesBusy, setRoutesBusy] = useState(false);
  const [routesLoadError, setRoutesLoadError] = useState<string | null>(null);
  const [routePathFilter, setRoutePathFilter] = useState("");
  const [selectedRoutePageAbs, setSelectedRoutePageAbs] = useState<string | null>(null);
  const [routeGlobalDepth, setRouteGlobalDepth] = useState(2);
  const [routeExpandedAbs, setRouteExpandedAbs] = useState<string[]>([]);
  const [routeDirExpanded, setRouteDirExpanded] = useState<Set<string>>(
    () => readPersistedRouteDirExpanded(),
  );

  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;

  const moduleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mod of modules) m.set(mod.id, mod.name);
    return m;
  }, [modules]);

  const moduleFileCountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const mod of modules) m.set(mod.id, mod.fileCount);
    return m;
  }, [modules]);

  const topSeamSignals = useMemo(() => {
    return seams
      .map((seam) => {
        const sourceCount = moduleFileCountById.get(seam.fromModuleId) ?? 1;
        const targetCount = moduleFileCountById.get(seam.toModuleId) ?? 1;
        const evidenceDensity = Math.min(
          1,
          seam.evidenceCount / Math.max(1, Math.min(sourceCount, targetCount)),
        );
        const score = seam.strength * 0.7 + evidenceDensity * 0.3;
        return { ...seam, evidenceDensity, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [moduleFileCountById, seams]);

  const routeExpandedSet = useMemo(() => new Set(routeExpandedAbs), [routeExpandedAbs]);

  const routePageNodes = useMemo(() => {
    if (!routesBaseline) return [];
    const out: GraphNode[] = [];
    for (const n of routesBaseline.nodes) {
      const rel = n.relativeFilePath ?? "";
      if (rel && isRoutePageListFile(rel)) out.push(n);
    }
    return out;
  }, [routesBaseline]);

  const routeTreeRootChildren = useMemo(() => {
    if (!routesBaseline) return [];
    const root: RouteTreeDir = { kind: "dir", segment: "", fullPrefix: "", children: [] };
    for (const n of routePageNodes) {
      const rel = n.relativeFilePath ?? "";
      if (!rel) continue;
      insertRoutePageIntoTree(root, rel, n.id, n.moduleLabel);
    }
    sortRouteTreeNodes(root.children);
    return root.children;
  }, [routesBaseline, routePageNodes]);

  const filteredRouteTree = useMemo(
    () => filterRouteTreeBySubstring(routeTreeRootChildren, routePathFilter),
    [routeTreeRootChildren, routePathFilter],
  );

  const routeDisplayGraph = useMemo(() => {
    if (!routesBaseline || !selectedRoutePageAbs) return null;
    return buildRouteFileSubgraph(
      routesBaseline,
      selectedRoutePageAbs,
      routeGlobalDepth,
      routeExpandedSet,
    );
  }, [routesBaseline, selectedRoutePageAbs, routeGlobalDepth, routeExpandedSet]);

  const routeFlowFitSuffix = useMemo(() => {
    if (surface !== "routes") return "";
    const ra = selectedRoutePageAbs ?? "none";
    const ex = [...routeExpandedAbs].sort().join("|");
    return `-route:${filePathKey(ra)}-${routeGlobalDepth}-${ex}`;
  }, [surface, selectedRoutePageAbs, routeGlobalDepth, routeExpandedAbs]);

  const loadMeta = useCallback(async (rid: string) => {
    const [mRes, sRes, vRes] = await Promise.all([
      fetch(`/api/repositories/${rid}/modules`),
      fetch(`/api/repositories/${rid}/seams`),
      fetch(`/api/repositories/${rid}/violations`),
    ]);
    if (mRes.ok) {
      const mj = (await mRes.json()) as { items: ModuleListItem[] };
      setModules(mj.items);
    }
    if (sRes.ok) {
      const sj = (await sRes.json()) as { items: SeamRow[] };
      setSeams(sj.items);
    }
    if (vRes.ok) {
      const vj = (await vRes.json()) as { items: ViolationRow[] };
      setViolations(vj.items);
    }
  }, []);

  const loadGraph = useCallback(async (rid: string, view: GraphView) => {
    const q =
      view.kind === "module"
        ? "level=module"
        : view.kind === "module-files"
          ? `level=file&moduleId=${encodeURIComponent(view.moduleId)}`
          : "level=file";
    const gRes = await fetch(`/api/repositories/${rid}/graph?${q}`);
    if (!gRes.ok) throw new Error("Failed to load graph");
    const g = (await gRes.json()) as GraphResponse;
    setRawGraph(g);
  }, []);

  const fetchRoutesBaseline = useCallback(async (rid: string) => {
    setRoutesBusy(true);
    setRoutesLoadError(null);
    try {
      const gRes = await fetch(`/api/repositories/${rid}/graph?level=file`);
      if (!gRes.ok) throw new Error("Failed to load file graph for routes");
      const g = (await gRes.json()) as GraphResponse;
      setRoutesBaseline(g);
    } catch (e: unknown) {
      setRoutesBaseline(null);
      setRoutesLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setRoutesBusy(false);
    }
  }, []);

  const loadAll = useCallback(
    async (rid: string) => {
      await loadMeta(rid);
      await loadGraph(rid, { kind: "module" });
    },
    [loadGraph, loadMeta],
  );

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then((j: { aiEnabled?: boolean; defaultRepositoryId?: string }) => {
        setAiEnabled(Boolean(j.aiEnabled));
        const rid = j.defaultRepositoryId;
        if (rid) setRepositoryId((prev) => prev ?? rid);
      })
      .catch(() => setAiEnabled(false));
  }, []);

  const fileDrillRef = useRef<string | null>(null);
  fileDrillRef.current = fileDrillModuleId;

  useEffect(() => {
    if (!repositoryId) return;
    setFileDrillModuleId(null);
    setSelectedFilePath(null);
    setRoutesBaseline(null);
    setRoutesLoadError(null);
    setSelectedRoutePageAbs(null);
    setRoutePathFilter("");
    setRouteExpandedAbs([]);
    void loadAll(repositoryId).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [repositoryId, loadAll]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SURFACE_STORAGE_KEY, surface);
    } catch {
      // Ignore storage failures and continue with in-memory state.
    }
  }, [surface]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        ROUTE_DIR_EXPANDED_STORAGE_KEY,
        JSON.stringify([...routeDirExpanded].sort()),
      );
    } catch {
      // Ignore storage failures and continue with in-memory state.
    }
  }, [routeDirExpanded]);

  useEffect(() => {
    setRouteExpandedAbs([]);
  }, [selectedRoutePageAbs]);

  useEffect(() => {
    if (!repositoryId || surface !== "routes") return;
    if (routesBusy) return;
    const sid = rawGraph?.snapshotId;
    const needsFetch =
      !routesBaseline || (Boolean(sid) && routesBaseline.snapshotId !== sid);
    if (needsFetch) void fetchRoutesBaseline(repositoryId);
  }, [
    repositoryId,
    surface,
    rawGraph?.snapshotId,
    routesBaseline,
    routesBusy,
    fetchRoutesBaseline,
  ]);

  useEffect(() => {
    if (!selectedRoutePageAbs || !routesBaseline) return;
    const k = filePathKey(selectedRoutePageAbs);
    const exists = routesBaseline.nodes.some((n) => filePathKey(n.id) === k);
    if (!exists) setSelectedRoutePageAbs(null);
  }, [routesBaseline, selectedRoutePageAbs]);

  useEffect(() => {
    if (!selectedRoutePageAbs || !routesBaseline) return;
    const gn = routesBaseline.nodes.find((n) => filePathKey(n.id) === filePathKey(selectedRoutePageAbs));
    const rel = gn?.relativeFilePath;
    if (!rel) return;
    const prefixes = routePathPrefixesForFile(rel);
    if (!prefixes.length) return;
    setRouteDirExpanded((prev) => {
      const next = new Set(prev);
      for (const p of prefixes) next.add(p);
      return next;
    });
  }, [selectedRoutePageAbs, routesBaseline]);

  useEffect(() => {
    if (!routePathFilter.trim()) return;
    const extra = collectAllDirPrefixesInTree(filteredRouteTree);
    if (!extra.length) return;
    setRouteDirExpanded((prev) => {
      const next = new Set(prev);
      for (const p of extra) next.add(p);
      return next;
    });
  }, [routePathFilter, filteredRouteTree]);

  const zoomIntoModule = useCallback(
    (moduleId: string) => {
      if (!repositoryId) return;
      setFileDrillModuleId(moduleId);
      setSelectedFilePath(null);
      void loadGraph(repositoryId, { kind: "module-files", moduleId }).catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
    },
    [loadGraph, repositoryId],
  );

  const openAllFiles = useCallback(() => {
    if (!repositoryId) return;
    setFileDrillModuleId(null);
    setSelectedFilePath(null);
    void loadGraph(repositoryId, { kind: "all-files" }).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [loadGraph, repositoryId]);

  const zoomOutToModules = useCallback(() => {
    if (!repositoryId) return;
    setFileDrillModuleId(null);
    setSelectedFilePath(null);
    void loadGraph(repositoryId, { kind: "module" }).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [loadGraph, repositoryId]);

  const openArchitectureSurface = useCallback(() => {
    setSurface("architecture");
    if (!repositoryId) return;
    void loadGraph(repositoryId, { kind: "module" }).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [loadGraph, repositoryId]);

  const openRoutesSurface = useCallback(() => {
    setSurface("routes");
  }, []);

  const toggleRouteDir = useCallback((fullPrefix: string) => {
    setRouteDirExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fullPrefix)) next.delete(fullPrefix);
      else next.add(fullPrefix);
      return next;
    });
  }, []);

  const refreshModuleDetail = useCallback(async (mid: string | null) => {
    if (!mid) return;
    try {
      const res = await fetch(`/api/modules/${mid}`);
      if (!res.ok) return;
      setDetail((await res.json()) as ModuleDetail);
    } catch {
      /* ignore */
    }
  }, []);

  const onEnrichAi = async () => {
    if (!repositoryId) return;
    setAiBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}/enrich`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: { message?: string } };
        throw new Error(j.error?.message ?? res.statusText);
      }
      await loadMeta(repositoryId);
      await loadGraph(
        repositoryId,
        fileDrillRef.current
          ? { kind: "module-files", moduleId: fileDrillRef.current }
          : rawGraph?.level === "file"
            ? { kind: "all-files" }
            : { kind: "module" },
      );
      await refreshModuleDetail(selectedModuleId);
      if (surfaceRef.current === "routes" && repositoryId) {
        void fetchRoutesBaseline(repositoryId);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const onRoutesNodeClick = useCallback(
    async (_e: React.MouseEvent, node: Node) => {
      if (!routeDisplayGraph) return;
      const clicked = routeDisplayGraph.nodes.find((n) => n.id === node.id);
      const moduleId = clicked?.moduleId ?? routeDisplayGraph.focusModuleId;
      if (!moduleId) return;
      setSelectedModuleId(moduleId);
      setSelectedFilePath(clicked ? node.id : null);
      setTab("module");
      try {
        const res = await fetch(`/api/modules/${moduleId}`);
        if (!res.ok) throw new Error("Failed to load module");
        setDetail((await res.json()) as ModuleDetail);
      } catch {
        setDetail(null);
      }
    },
    [routeDisplayGraph],
  );

  const onNodeClick = useCallback(
    async (_e: React.MouseEvent, node: Node) => {
      const fileScope = rawGraph?.level === "file";
      if (fileScope) {
        const clicked = rawGraph?.nodes.find((n) => n.id === node.id);
        const moduleId = clicked?.moduleId ?? rawGraph?.focusModuleId;
        if (!moduleId) return;
        setSelectedModuleId(moduleId);
        setSelectedFilePath(clicked ? node.id : null);
        setTab("module");
        try {
          const res = await fetch(`/api/modules/${moduleId}`);
          if (!res.ok) throw new Error("Failed to load module");
          setDetail((await res.json()) as ModuleDetail);
        } catch {
          setDetail(null);
        }
        return;
      }
      setSelectedFilePath(null);
      setSelectedModuleId(node.id);
      setTab("module");
      try {
        const res = await fetch(`/api/modules/${node.id}`);
        if (!res.ok) throw new Error("Failed to load module");
        setDetail((await res.json()) as ModuleDetail);
      } catch {
        setDetail(null);
      }
    },
    [rawGraph],
  );

  const onNodeDoubleClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (rawGraph?.level !== "module") return;
      zoomIntoModule(node.id);
    },
    [rawGraph?.level, zoomIntoModule],
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-zinc-50 text-zinc-900">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
        {repositoryId ? (
          <span className="text-xs text-zinc-500">
            Repository <code className="rounded bg-zinc-100 px-1">{repositoryId.slice(0, 8)}…</code>
          </span>
        ) : null}
        {repositoryId ? (
          <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-medium">
            <button
              type="button"
              className={`rounded px-2.5 py-1.5 ${
                surface === "architecture" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"
              }`}
              onClick={() => openArchitectureSurface()}
            >
              Architecture
            </button>
            <button
              type="button"
              className={`rounded px-2.5 py-1.5 ${
                surface === "routes" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"
              }`}
              onClick={() => openRoutesSurface()}
            >
              Routes
            </button>
          </div>
        ) : null}
        {repositoryId && aiEnabled ? (
          <button
            type="button"
            className="rounded border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
            disabled={aiBusy}
            onClick={() => void onEnrichAi()}
          >
            {aiBusy ? "AI summaries…" : "Generate AI summaries"}
          </button>
        ) : null}
        {repositoryId && surface === "architecture" && rawGraph?.level === "file" ? (
          <button
            type="button"
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => zoomOutToModules()}
          >
            ← Module map
          </button>
        ) : null}
        {repositoryId && surface === "architecture" && rawGraph?.level === "module" ? (
          <button
            type="button"
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => openAllFiles()}
          >
            All files (module-clustered)
          </button>
        ) : null}
        {repositoryId &&
        surface === "architecture" &&
        rawGraph?.level === "module" &&
        selectedModuleId ? (
          <button
            type="button"
            className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100"
            onClick={() => zoomIntoModule(selectedModuleId)}
          >
            Zoom to files
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-zinc-500">Edges</label>
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            value={edgeFilter}
            onChange={(e) => setEdgeFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="import">import</option>
          </select>
        </div>
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {repositoryId && surface === "routes" ? (
          <div className="flex w-[min(22rem,42vw)] shrink-0 flex-col border-r border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-3 py-2">
              <div className="text-sm font-semibold text-zinc-900">Pages</div>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                Folder tree of repo-relative paths. Expand folders to browse; use Details under a page
                for full path and module. Select a page to graph first-party imports (depth below); expand
                a file in the graph to pull in its direct imports.
              </p>
              <input
                type="search"
                className="mt-2 w-full rounded border border-zinc-300 px-2 py-1.5 text-xs"
                placeholder="Filter by path…"
                value={routePathFilter}
                onChange={(e) => setRoutePathFilter(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 border-b border-zinc-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-600">
                <span>Import depth</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded border border-zinc-300 bg-white px-2 py-0.5 disabled:opacity-40"
                    disabled={routeGlobalDepth <= 1}
                    onClick={() => setRouteGlobalDepth((d) => Math.max(1, d - 1))}
                  >
                    −
                  </button>
                  <span className="min-w-[1.5rem] text-center font-mono">{routeGlobalDepth}</span>
                  <button
                    type="button"
                    className="rounded border border-zinc-300 bg-white px-2 py-0.5 disabled:opacity-40"
                    disabled={routeGlobalDepth >= 12}
                    onClick={() => setRouteGlobalDepth((d) => Math.min(12, d + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
                disabled={!selectedFilePath || !selectedRoutePageAbs}
                onClick={() => {
                  if (!selectedFilePath) return;
                  const k = filePathKey(selectedFilePath);
                  setRouteExpandedAbs((prev) =>
                    prev.some((p) => filePathKey(p) === k) ? prev : [...prev, selectedFilePath],
                  );
                }}
              >
                Expand imports from selected file
              </button>
              {routeExpandedAbs.length ? (
                <button
                  type="button"
                  className="text-left text-[11px] text-zinc-500 underline hover:text-zinc-800"
                  onClick={() => setRouteExpandedAbs([])}
                >
                  Clear file expansions
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
              {routesBusy ? (
                <p className="px-2 text-xs text-zinc-500">Loading file graph…</p>
              ) : routesLoadError ? (
                <p className="px-2 text-xs text-red-700">{routesLoadError}</p>
              ) : filteredRouteTree.length === 0 ? (
                <p className="px-2 text-xs text-zinc-600">
                  No <code className="rounded bg-zinc-100 px-0.5">page.*</code> or{" "}
                  <code className="rounded bg-zinc-100 px-0.5">pages/</code> routes match this filter (or
                  none exist in this snapshot).
                </p>
              ) : (
                <div className="px-1">
                  <RouteFolderTree
                    nodes={filteredRouteTree}
                    depth={0}
                    selectedAbs={selectedRoutePageAbs}
                    expandedPrefixes={routeDirExpanded}
                    onToggleDir={toggleRouteDir}
                    onSelectFile={setSelectedRoutePageAbs}
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <ReactFlowProvider>
            <ArchMapFlow
              rawGraph={
                surface === "routes"
                  ? (routeDisplayGraph ?? {
                      snapshotId: routesBaseline?.snapshotId ?? rawGraph?.snapshotId ?? "",
                      level: "file",
                      nodes: [],
                      edges: [],
                    })
                  : rawGraph
              }
              violations={surface === "routes" ? [] : violations}
              edgeFilter={edgeFilter}
              selectedFilePath={selectedFilePath}
              onNodeClick={surface === "routes" ? onRoutesNodeClick : onNodeClick}
              onNodeDoubleClick={surface === "routes" ? () => {} : onNodeDoubleClick}
              forceFlatFileLayout={surface === "routes"}
              flatLayoutRootId={surface === "routes" ? selectedRoutePageAbs : null}
              fitKeySuffix={routeFlowFitSuffix}
            />
          </ReactFlowProvider>
          {surface === "routes" &&
          !selectedRoutePageAbs &&
          !routesBusy &&
          routesBaseline &&
          !routesLoadError ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-50/80">
              <p className="max-w-sm rounded-lg border border-zinc-200 bg-white px-4 py-3 text-center text-sm text-zinc-600 shadow-sm">
                Select a page on the left to show its dependency graph here.
              </p>
            </div>
          ) : null}
        </div>

        <aside className="flex w-[380px] shrink-0 flex-col border-l border-zinc-200 bg-white">
          <div className="flex border-b border-zinc-200">
            {(
              [
                ["module", "Module"],
                ["seams", "Seams"],
                ["violations", "Issues"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`flex-1 px-3 py-2 text-sm font-medium ${
                  tab === k ? "border-b-2 border-zinc-900 text-zinc-900" : "text-zinc-500"
                }`}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
            {tab === "module" ? (
              <div className="space-y-3">
                {rawGraph?.level === "file" ? (
                  <p className="text-xs text-zinc-600">
                    File-level view:{" "}
                    <span className="font-medium text-zinc-800">
                      {fileDrillModuleId
                        ? (moduleNameById.get(fileDrillModuleId) ?? "module")
                        : "all modules"}
                    </span>
                    . Files are grouped by module first, then by top-level subfolder cluster. Double-click a
                    module on the map to zoom; import arrows are always shown. Click a file to emphasize
                    its outgoing imports in blue.
                  </p>
                ) : (
                  <p className="text-xs text-zinc-600">
                    Module map emphasizes seam strength (edge thickness) and evidence density (edge opacity).
                    Labels show evidence counts.
                  </p>
                )}
                {rawGraph?.level !== "file" && topSeamSignals.length ? (
                  <div className="rounded border border-zinc-200 bg-zinc-50 p-2">
                    <div className="mb-1 text-xs font-semibold text-zinc-700">Top seam signals</div>
                    <ul className="space-y-1 text-xs text-zinc-700">
                      {topSeamSignals.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {moduleNameById.get(s.fromModuleId) ?? s.fromModuleId.slice(0, 8)} →{" "}
                            {moduleNameById.get(s.toModuleId) ?? s.toModuleId.slice(0, 8)}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-600">
                            s {s.strength.toFixed(2)} · d {s.evidenceDensity.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {selectedModuleId ? (
                  <p className="text-xs text-zinc-500">
                    Selected module{" "}
                    <code className="rounded bg-zinc-100 px-1">{selectedModuleId.slice(0, 12)}…</code>
                  </p>
                ) : (
                  <p className="text-zinc-500">
                    Click a module to inspect. Double-click a module (or use “Zoom to files”) to open the
                    import graph for that folder.
                  </p>
                )}
                {selectedFilePath ? (
                  <p className="rounded border border-blue-200 bg-blue-50 p-2 font-mono text-xs text-blue-950 break-all">
                    Selected file: {selectedFilePath}
                  </p>
                ) : null}
                {detail ? (
                  <>
                    <h2 className="text-lg font-semibold">{detail.name}</h2>
                    {detail.description ? <p className="text-zinc-600">{detail.description}</p> : null}
                    {detail.aiSummary ? (
                      <div className="rounded border border-violet-200 bg-violet-50 p-2 text-zinc-800">
                        <div className="text-xs font-semibold text-violet-800">AI summary</div>
                        <p className="mt-1 whitespace-pre-wrap">{detail.aiSummary}</p>
                      </div>
                    ) : null}
                    <div>
                      <div className="font-medium text-zinc-700">Dependencies in</div>
                      <ul className="mt-1 list-inside list-disc text-zinc-600">
                        {detail.inboundDependencies.map((id) => (
                          <li key={id}>{moduleNameById.get(id) ?? id}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="font-medium text-zinc-700">Dependencies out</div>
                      <ul className="mt-1 list-inside list-disc text-zinc-600">
                        {detail.outboundDependencies.map((id) => (
                          <li key={id}>{moduleNameById.get(id) ?? id}</li>
                        ))}
                      </ul>
                    </div>
                    {detail.importCallSites.inboundTotal + detail.importCallSites.outboundTotal > 0 ? (
                      <div className="rounded border border-sky-200 bg-sky-50/80 p-2 text-xs text-zinc-800">
                        <div className="font-semibold text-sky-900">Import-linked calls (static)</div>
                        <p className="mt-1 text-[11px] text-zinc-600">
                          Direct calls on imported bindings (and{" "}
                          <code className="rounded bg-white/80 px-0.5">import * as x</code> roots). Caps
                          apply; cross-boundary sites are prioritized.
                        </p>
                        <div className="mt-2 font-medium text-zinc-700">
                          Outbound ({detail.importCallSites.outbound.length} shown
                          {detail.importCallSites.outboundOmitted
                            ? `, ${detail.importCallSites.outboundOmitted} omitted`
                            : ""}{" "}
                          · {detail.importCallSites.outboundTotal} total)
                        </div>
                        <ul className="mt-1 max-h-36 list-none space-y-1 overflow-y-auto font-mono text-[11px] text-zinc-700">
                          {detail.importCallSites.outboundLines.map((line, i) => (
                            <li key={`oc-${i}`} className="break-all border-b border-sky-100/80 pb-1 last:border-0">
                              {line}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 font-medium text-zinc-700">
                          Inbound ({detail.importCallSites.inbound.length} shown
                          {detail.importCallSites.inboundOmitted
                            ? `, ${detail.importCallSites.inboundOmitted} omitted`
                            : ""}{" "}
                          · {detail.importCallSites.inboundTotal} total)
                        </div>
                        <ul className="mt-1 max-h-36 list-none space-y-1 overflow-y-auto font-mono text-[11px] text-zinc-700">
                          {detail.importCallSites.inboundLines.map((line, i) => (
                            <li key={`ic-${i}`} className="break-all border-b border-sky-100/80 pb-1 last:border-0">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div>
                      <div className="font-medium text-zinc-700">Files</div>
                      <ul className="mt-1 max-h-40 overflow-y-auto font-mono text-xs text-zinc-600">
                        {detail.contents.map((c) => (
                          <li key={c.path}>{c.path}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="font-medium text-zinc-700">Public surface (exports)</div>
                      <p className="mt-1 font-mono text-xs text-zinc-600">
                        {detail.publicSurface.slice(0, 40).join(", ")}
                        {detail.publicSurface.length > 40 ? "…" : ""}
                      </p>
                    </div>
                    {detail.risks.length ? (
                      <div>
                        <div className="font-medium text-zinc-700">Risks</div>
                        <ul className="mt-1 space-y-1">
                          {detail.risks.map((r, i) => (
                            <li key={i} className="text-amber-800">
                              [{r.severity}] {r.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {tab === "seams" ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-zinc-500">
                    <th className="py-1 pr-2">From</th>
                    <th className="py-1 pr-2">To</th>
                    <th className="py-1">Type</th>
                    <th className="py-1 pl-2">Strength</th>
                    <th className="py-1 pl-2">Density</th>
                  </tr>
                </thead>
                <tbody>
                  {seams.map((s) => (
                    <tr key={s.id} className="border-b border-zinc-100">
                      <td className="py-1 pr-2 font-mono">
                        {moduleNameById.get(s.fromModuleId) ?? s.fromModuleId.slice(0, 8)}
                      </td>
                      <td className="py-1 pr-2 font-mono">
                        {moduleNameById.get(s.toModuleId) ?? s.toModuleId.slice(0, 8)}
                      </td>
                      <td className="py-1">{s.seamType}</td>
                      <td className="py-1 pl-2 font-mono">{s.strength.toFixed(2)}</td>
                      <td className="py-1 pl-2 font-mono">
                        {(
                          s.evidenceCount /
                          Math.max(
                            1,
                            Math.min(
                              moduleFileCountById.get(s.fromModuleId) ?? 1,
                              moduleFileCountById.get(s.toModuleId) ?? 1,
                            ),
                          )
                        ).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {tab === "violations" ? (
              <ul className="space-y-2">
                {violations.map((v) => (
                  <li key={v.id} className="rounded border border-amber-100 bg-amber-50 p-2 text-xs">
                    <div className="font-semibold text-amber-900">{v.type}</div>
                    <div className="text-amber-900/90">{v.message}</div>
                    <div className="text-amber-800/80">{v.severity}</div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
