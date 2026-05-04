import { NextResponse } from "next/server";
import type { Snapshot } from "@archmap/graph-model";
import { extractPublicSurface } from "@archmap/analyzer";
import path from "node:path";

/** First path segment under the module folder; loose files in the module root share "__root__". */
function directoryGroupForModuleFile(
  moduleFolderAbs: string,
  fileAbs: string,
): { groupKey: string; groupLabel: string } {
  const mod = path.normalize(moduleFolderAbs);
  const dir = path.normalize(path.dirname(fileAbs));
  const rel = path.relative(mod, dir).replace(/\\/g, "/");
  if (!rel || rel === ".") return { groupKey: "__root__", groupLabel: "Module root" };
  const segment = rel.split("/").filter(Boolean)[0];
  if (!segment) return { groupKey: "__root__", groupLabel: "Module root" };
  return { groupKey: segment, groupLabel: segment };
}

export function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function repositorySummary(snapshot: Snapshot) {
  return {
    id: snapshot.repository.id,
    name: snapshot.repository.name,
    language: snapshot.repository.language,
    framework: snapshot.repository.framework,
    latestSnapshotId: snapshot.meta.id,
    status: "ready" as const,
  };
}

export interface GraphFromSnapshotOptions {
  /** When set with `level=file`, only files in this module and internal import edges are returned. */
  moduleId?: string;
}

export function graphFromSnapshot(
  snapshot: Snapshot,
  level: "module" | "file" | "element",
  options?: GraphFromSnapshotOptions,
) {
  const rootPath = path.normalize(snapshot.repository.path);
  const moduleById = new Map(snapshot.modules.map((modEntry) => [modEntry.id, modEntry]));
  const moduleFileCounts = new Map<string, number>();
  for (const el of snapshot.elements) {
    moduleFileCounts.set(el.moduleId, (moduleFileCounts.get(el.moduleId) ?? 0) + 1);
  }

  if (level === "module") {
    const nodes = snapshot.modules.map((m) => {
      const vCount = snapshot.violations.filter(
        (v) => v.moduleId === m.id || v.moduleIds?.includes(m.id),
      ).length;
      let risk: "low" | "medium" | "high" = "low";
      if (vCount >= 3) risk = "high";
      else if (vCount >= 1) risk = "medium";
      return {
        id: m.id,
        type: "module" as const,
        name: m.name,
        risk,
      };
    });
    const seamByPair = new Map<string, Snapshot["seams"][number]>();
    for (const seam of snapshot.seams) {
      seamByPair.set(`${seam.fromModuleId}=>${seam.toModuleId}`, seam);
    }
    const edges = snapshot.moduleDependencies.map((e) => {
      const seam = seamByPair.get(`${e.sourceModuleId}=>${e.targetModuleId}`);
      const sourceCount = moduleFileCounts.get(e.sourceModuleId) ?? 1;
      const targetCount = moduleFileCounts.get(e.targetModuleId) ?? 1;
      const evidenceCount = seam?.evidenceCount ?? e.evidenceCount;
      const evidenceDensity = Math.min(1, evidenceCount / Math.max(1, Math.min(sourceCount, targetCount)));
      const strength = seam?.strength ?? Math.min(1, e.weight / (5 + e.weight));
      return {
        id: e.id,
        source: e.sourceModuleId,
        target: e.targetModuleId,
        type: e.type,
        strength,
        evidenceCount,
        evidenceDensity,
      };
    });
    return {
      snapshotId: snapshot.meta.id,
      level: "module" as const,
      nodes,
      edges,
    };
  }
  if (level === "file") {
    const focusModuleId = options?.moduleId;
    let elements = snapshot.elements;
    if (focusModuleId) {
      elements = elements.filter((el) => el.moduleId === focusModuleId);
    }
    const focusedModule = focusModuleId
      ? snapshot.modules.find((m) => m.id === focusModuleId)
      : undefined;
    const nodes = elements.map((el) => {
      const abs = path.normalize(path.join(rootPath, el.filePath));
      const displayName = path.basename(el.filePath);
      const moduleEntry = moduleById.get(el.moduleId);
      const fallbackFocusedModule = focusedModule?.id === el.moduleId ? focusedModule : undefined;
      const resolvedModule = moduleEntry ?? fallbackFocusedModule;
      const moduleLabel = resolvedModule?.name ?? el.moduleId;
      const folderPath = resolvedModule?.folderPath;
      const { groupKey, groupLabel } = folderPath
        ? directoryGroupForModuleFile(folderPath, abs)
        : { groupKey: "__root__", groupLabel: "Module root" };
      const groupId = `grp:${el.moduleId}:${groupKey}`;
      return {
        id: abs,
        type: "module" as const,
        name: displayName,
        risk: undefined as undefined,
        moduleId: el.moduleId,
        moduleLabel,
        groupId,
        groupLabel,
      };
    });
    const pathSet = new Set(
      elements.map((el) => path.normalize(path.join(rootPath, el.filePath))),
    );
    let deps = snapshot.fileDependencies;
    if (focusModuleId) {
      deps = deps.filter(
        (e) =>
          pathSet.has(path.normalize(e.sourceFilePath)) &&
          pathSet.has(path.normalize(e.targetFilePath)),
      );
    }
    const edges = deps.map((e) => ({
      id: e.id,
      source: e.sourceFilePath,
      target: e.targetFilePath,
      type: e.type,
    }));
    return {
      snapshotId: snapshot.meta.id,
      level: "file" as const,
      ...(focusModuleId ? { focusModuleId } : {}),
      nodes,
      edges,
    };
  }
  return {
    snapshotId: snapshot.meta.id,
    level: "element" as const,
    nodes: [],
    edges: [],
  };
}

export function modulesList(snapshot: Snapshot) {
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  const files = new Map<string, number>();
  for (const el of snapshot.elements) {
    files.set(el.moduleId, (files.get(el.moduleId) ?? 0) + 1);
  }
  for (const e of snapshot.moduleDependencies) {
    outbound.set(e.sourceModuleId, (outbound.get(e.sourceModuleId) ?? 0) + 1);
    inbound.set(e.targetModuleId, (inbound.get(e.targetModuleId) ?? 0) + 1);
  }
  const items = snapshot.modules.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    inferredConfidence: m.inferredConfidence,
    inboundCount: inbound.get(m.id) ?? 0,
    outboundCount: outbound.get(m.id) ?? 0,
    fileCount: files.get(m.id) ?? 0,
    violationCount: snapshot.violations.filter(
      (v) => v.moduleId === m.id || v.moduleIds?.includes(m.id),
    ).length,
  }));
  return { items };
}

export function moduleDetail(snapshot: Snapshot, moduleId: string, rootPath: string) {
  const mod = snapshot.modules.find((m) => m.id === moduleId);
  if (!mod) return null;

  const inbound = [
    ...new Set(
      snapshot.moduleDependencies
        .filter((d) => d.targetModuleId === moduleId)
        .map((d) => d.sourceModuleId),
    ),
  ];
  const outbound = [
    ...new Set(
      snapshot.moduleDependencies
        .filter((d) => d.sourceModuleId === moduleId)
        .map((d) => d.targetModuleId),
    ),
  ];

  const contents = snapshot.elements
    .filter((el) => el.moduleId === moduleId)
    .map((el) => ({
      type: "file" as const,
      path: el.filePath,
      name: el.name,
    }));

  const filesInMod = snapshot.elements
    .filter((el) => el.moduleId === moduleId)
    .map((el) => path.join(rootPath, el.filePath));

  const surface: string[] = [];
  for (const f of filesInMod.slice(0, 60)) {
    const { exports } = extractPublicSurface(f, moduleId);
    surface.push(...exports.map((x) => x));
  }

  const risks = snapshot.violations
    .filter((v) => v.moduleId === moduleId || v.moduleIds?.includes(moduleId))
    .map((v) => ({ severity: v.severity, message: v.message }));

  return {
    id: mod.id,
    name: mod.name,
    description: mod.description,
    contents,
    publicSurface: [...new Set(surface)].slice(0, 80),
    inboundDependencies: inbound,
    outboundDependencies: outbound,
    risks,
    aiSummary: snapshot.ai?.moduleSummaries?.[moduleId],
  };
}
