"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

type GraphNode = {
  id: string;
  type: "module";
  name: string;
  risk?: "low" | "medium" | "high";
  moduleId?: string;
  moduleLabel?: string;
  /** Directory cluster under the module folder ("Module root" for loose files). */
  groupId?: string;
  groupLabel?: string;
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
};

type ModuleListItem = {
  id: string;
  name: string;
  description?: string;
  inferredConfidence: number;
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
const FILE_CELL_H = 78;
const FILE_INNER_COLS = 3;
const FILE_GROUP_V_GAP = 24;
const FILE_MODULE_PAD = 18;
const FILE_MODULE_HEADER = 34;
const FILE_MODULE_V_GAP = 44;

function layoutFileGraphWithGroups(gn: GraphNode[]): Node[] {
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

    for (const [directoryGroupId, directoryFiles] of directoryEntries) {
      const sortedFiles = [...directoryFiles].sort((a, b) => a.name.localeCompare(b.name));
      const count = sortedFiles.length;
      const cols = Math.min(FILE_INNER_COLS, Math.max(1, Math.ceil(Math.sqrt(count))));
      const rows = Math.ceil(count / cols);
      const directoryFrameW = FILE_GROUP_PAD * 2 + cols * FILE_CELL_W;
      const directoryFrameH = FILE_GROUP_HEADER + FILE_GROUP_PAD * 2 + rows * FILE_CELL_H;
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

      sortedFiles.forEach((file, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        files.push({
          id: file.id,
          position: {
            x: directoryFrameX + FILE_GROUP_PAD + col * FILE_CELL_W,
            y: directoryFrameY + FILE_GROUP_HEADER + FILE_GROUP_PAD + row * FILE_CELL_H,
          },
          data: { label: file.name },
          style: {
            border: `2px solid ${riskColor(file.risk)}`,
            borderRadius: 8,
            padding: 6,
            fontSize: 11,
            maxWidth: 160,
            background: "#fafafa",
            zIndex: 2,
          },
        });
      });

      directoryYOffset += directoryFrameH + FILE_GROUP_V_GAP;
      moduleInnerMaxWidth = Math.max(moduleInnerMaxWidth, directoryFrameW);
    }

    const moduleFrameWidth = FILE_MODULE_PAD * 2 + moduleInnerMaxWidth;
    const moduleFrameHeight = directoryYOffset + FILE_MODULE_PAD - FILE_GROUP_V_GAP;
    frames.push({
      id: `frame:module:${moduleId}`,
      type: "groupFrame",
      position: { x: x0, y: yCursor },
      draggable: false,
      selectable: false,
      focusable: false,
      data: { label: moduleLabel, tone: "module" },
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

function GroupFrameNode({
  data,
}: NodeProps<{ label: string; tone?: "module" | "directory" }>) {
  const isModuleFrame = data.tone === "module";
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
      <div className="min-h-0 flex-1 bg-transparent" aria-hidden />
    </div>
  );
}

const archMapNodeTypes = { groupFrame: GroupFrameNode };

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
  onNodeClick,
  onNodeDoubleClick,
}: {
  rawGraph: GraphResponse | null;
  violations: ViolationRow[];
  edgeFilter: string;
  onNodeClick: (e: React.MouseEvent, n: Node) => void;
  onNodeDoubleClick: (e: React.MouseEvent, n: Node) => void;
}) {
  const cycleIds = useMemo(() => cycleIdsFromViolations(violations), [violations]);
  const isModuleGraph = rawGraph?.level === "module";
  const useFileGroups =
    rawGraph?.level === "file" &&
    Boolean(rawGraph?.nodes.some((n) => n.moduleId));

  const initial = useMemo(() => {
    if (!rawGraph) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }
    const { nodes: gn, edges: ge } = rawGraph;

    let rfNodes: Node[];
    if (useFileGroups) {
      rfNodes = layoutFileGraphWithGroups(gn);
    } else {
      const pos = new Map<string, { x: number; y: number }>();
      const cellX = isModuleGraph ? 220 : 180;
      const cellY = isModuleGraph ? 120 : 90;
      gn.forEach((n, i) => {
        const col = i % 6;
        const row = Math.floor(i / 6);
        pos.set(n.id, { x: col * cellX, y: row * cellY });
      });

      rfNodes = gn.map((n) => ({
        id: n.id,
        position: pos.get(n.id) ?? { x: 0, y: 0 },
        data: { label: n.name },
        style: {
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

    const rfEdges: Edge[] = ge
      .filter((e) => edgeFilter === "all" || e.type === edgeFilter)
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label:
          isModuleGraph && typeof e.evidenceCount === "number"
            ? `${e.type} · ev ${e.evidenceCount}`
            : e.type,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: isModuleGraph
          ? {
              stroke: `rgba(71, 85, 105, ${0.3 + (e.evidenceDensity ?? 0) * 0.7})`,
              strokeWidth: 1 + (e.strength ?? 0) * 4,
            }
          : { stroke: "#64748b" },
      }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [rawGraph, cycleIds, edgeFilter, isModuleGraph, useFileGroups]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial.nodes, initial.edges, setEdges, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const fitKey = `${rawGraph?.snapshotId ?? ""}-${rawGraph?.level ?? ""}-${rawGraph?.focusModuleId ?? ""}`;

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
    void loadAll(repositoryId).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [repositoryId, loadAll]);

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const onNodeClick = useCallback(
    async (_e: React.MouseEvent, node: Node) => {
      const fileScope = rawGraph?.level === "file";
      if (fileScope) {
        const clicked = rawGraph?.nodes.find((n) => n.id === node.id);
        const moduleId = clicked?.moduleId ?? rawGraph?.focusModuleId;
        if (!moduleId) return;
        setSelectedModuleId(moduleId);
        setSelectedFilePath(node.id);
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
        {repositoryId && rawGraph?.level === "file" ? (
          <button
            type="button"
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => zoomOutToModules()}
          >
            ← Module map
          </button>
        ) : null}
        {repositoryId && rawGraph?.level === "module" ? (
          <button
            type="button"
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => openAllFiles()}
          >
            All files (module-clustered)
          </button>
        ) : null}
        {repositoryId && rawGraph?.level === "module" && selectedModuleId ? (
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
        <div className="relative min-w-0 flex-1">
          <ReactFlowProvider>
            <ArchMapFlow
              rawGraph={rawGraph}
              violations={violations}
              edgeFilter={edgeFilter}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
            />
          </ReactFlowProvider>
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
                    module on the map to zoom; click a file node to highlight it.
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
