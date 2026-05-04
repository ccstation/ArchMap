import path from "node:path";
import type { ArchitecturalRole, Element, EvidenceEntry } from "@archmap/graph-model";
import type { AnalysisThresholds } from "@archmap/graph-model";
import type { FileScanInfo } from "../file-graph.js";

function norm(p: string): string {
  return path.normalize(p);
}

function architecturalRoleScore(role: ArchitecturalRole): number {
  const table: Partial<Record<ArchitecturalRole, number>> = {
    route: 94,
    controller: 88,
    facade: 90,
    service: 78,
    "domain model": 80,
    repository: 72,
    adapter: 70,
    "event producer": 75,
    "event consumer": 74,
    store: 76,
    "UI component": 68,
    util: 28,
    constants: 32,
    types: 34,
    generated: 22,
    test: 18,
    unknown: 44,
  };
  return table[role] ?? 44;
}

function computeNoiseScore(
  scan: FileScanInfo,
  role: ArchitecturalRole,
  fanOut: number,
): { noise: number; evidence: EvidenceEntry[] } {
  let n = 0;
  const evidence: EvidenceEntry[] = [];
  const { flags } = scan;
  if (flags.isTestOnly) {
    n += 35;
    evidence.push({ type: "test-only", weight: 0.9, detail: "Test-only path or pattern" });
  }
  if (flags.isGenerated) {
    n += 40;
    evidence.push({ type: "generated", weight: 0.95, detail: "Generated or codegen path" });
  }
  if (role === "util" || role === "types" || role === "constants") {
    n += 28;
    evidence.push({ type: "passive-role", weight: 0.6, detail: `Role ${role}` });
  }
  if (role === "unknown" && fanOut <= 1) {
    n += 15;
    evidence.push({ type: "low-signal", weight: 0.4, detail: "Unknown role with low fan-out" });
  }
  return { noise: Math.min(100, n), evidence };
}

function normalizeCallerCount(c: number): number {
  return Math.min(100, Math.round((100 * Math.min(c, 20)) / 20));
}

function normalizeCrossModuleCallers(c: number): number {
  return Math.min(100, Math.round((100 * Math.min(c, 12)) / 12));
}

function normalizeDownstreamReach(r: number): number {
  return Math.min(100, Math.round((100 * Math.min(r, 120)) / 120));
}

export function buildAdjacencyForward(
  internalEdges: { sourceFilePath: string; targetFilePath: string }[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of internalEdges) {
    const a = norm(e.sourceFilePath);
    const b = norm(e.targetFilePath);
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  }
  return adj;
}

export function buildReverseAdjacency(
  internalEdges: { sourceFilePath: string; targetFilePath: string }[],
): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  for (const e of internalEdges) {
    const a = norm(e.sourceFilePath);
    const b = norm(e.targetFilePath);
    if (!rev.has(b)) rev.set(b, new Set());
    rev.get(b)!.add(a);
  }
  return rev;
}

export function downstreamReach(start: string, adj: Map<string, Set<string>>, cap: number): number {
  const seen = new Set<string>();
  const q: string[] = [norm(start)];
  seen.add(norm(start));
  while (q.length > 0 && seen.size < cap) {
    const u = q.shift()!;
    for (const v of adj.get(u) ?? []) {
      if (seen.has(v)) continue;
      seen.add(v);
      q.push(v);
    }
  }
  return Math.max(0, seen.size - 1);
}

export function buildElements(
  rootPath: string,
  files: string[],
  fileToModuleId: Map<string, string>,
  scanByPath: Map<string, FileScanInfo>,
  internalEdges: { sourceFilePath: string; targetFilePath: string }[],
  thresholds: AnalysisThresholds,
  shortIdEl: (modId: string, fileAbs: string) => string,
): Element[] {
  const fwd = buildAdjacencyForward(internalEdges);
  const rev = buildReverseAdjacency(internalEdges);
  const callersByFile = rev;

  const elements: Element[] = [];
  for (const fileAbs of files) {
    const n = norm(fileAbs);
    const modId = fileToModuleId.get(n);
    if (!modId) continue;
    const scan = scanByPath.get(n);
    if (!scan) continue;
    const rel = scan.relPath;
    const base = path.basename(fileAbs, path.extname(fileAbs));
    const role = scan.role;
    const fanOut = fwd.get(n)?.size ?? 0;
    const callers = callersByFile.get(n) ?? new Set();
    const fanIn = callers.size;
    const distinctCallerCount = fanIn;
    let distinctCallingModuleCount = 0;
    if (distinctCallerCount > 0) {
      const mods = new Set<string>();
      for (const c of callers) {
        mods.add(fileToModuleId.get(c) ?? "__none__");
      }
      distinctCallingModuleCount = mods.size;
    }
    const reach = downstreamReach(n, fwd, 500);
    const { noise: noiseScore, evidence: noiseEvidence } = computeNoiseScore(scan, role, fanOut);
    const publicSurfaceScore = scan.flags.isPublicExport ? 100 : 0;
    const roleScore = architecturalRoleScore(role);
    const callerCountScore = normalizeCallerCount(distinctCallerCount);
    const crossModuleCallerScore = normalizeCrossModuleCallers(distinctCallingModuleCount);
    const downstreamReachScore = normalizeDownstreamReach(reach);
    const surfaceVisibilityScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          0.2 * callerCountScore +
            0.25 * crossModuleCallerScore +
            0.2 * publicSurfaceScore +
            0.2 * roleScore +
            0.15 * downstreamReachScore -
            0.3 * noiseScore,
        ),
      ),
    );
    const collapsedByDefault = surfaceVisibilityScore < thresholds.visibilityCollapseBelow;
    const metrics: Element["metrics"] = {
      distinctCallerCount,
      distinctCallingModuleCount,
      fanIn,
      fanOut,
      downstreamReach: reach,
    };
    const visibility: Element["visibility"] = {
      surfaceVisibilityScore,
      collapsedByDefault,
    };
    const elEvidence: EvidenceEntry[] = [...noiseEvidence];
    if (scan.flags.isPublicExport) {
      elEvidence.push({ type: "public-export", weight: 0.85, detail: "File exports public symbols" });
    }
    elements.push({
      id: shortIdEl(modId, n),
      moduleId: modId,
      type: "file",
      name: base,
      filePath: rel.replace(/\\/g, "/"),
      role,
      flags: scan.flags,
      metrics,
      visibility,
      noiseScore,
      evidence: elEvidence.length ? elEvidence : undefined,
    });
  }
  return elements;
}
