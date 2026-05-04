import { describe, it, expect } from "vitest";
import { buildAdjacency, findCycleGroups, runRules } from "./rules.js";

function fullAdjacency(
  pairs: { sourceModuleId: string; targetModuleId: string }[],
): Map<string, Set<string>> {
  const ids = new Set<string>();
  for (const p of pairs) {
    ids.add(p.sourceModuleId);
    ids.add(p.targetModuleId);
  }
  const adj = buildAdjacency(pairs);
  for (const id of ids) {
    if (!adj.has(id)) adj.set(id, new Set());
  }
  return adj;
}

describe("findCycleGroups", () => {
  it("detects a two-node cycle", () => {
    const adj = fullAdjacency([
      { sourceModuleId: "m_a", targetModuleId: "m_b" },
      { sourceModuleId: "m_b", targetModuleId: "m_a" },
    ]);
    const cycles = findCycleGroups(adj);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });
});

describe("runRules", () => {
  it("emits circular dependency violations", () => {
    const adj = fullAdjacency([
      { sourceModuleId: "m_a", targetModuleId: "m_b" },
      { sourceModuleId: "m_b", targetModuleId: "m_a" },
    ]);
    const violations = runRules({
      repositoryId: "repo",
      rootPath: "/tmp",
      moduleIds: ["m_a", "m_b"],
      adjacency: adj,
      moduleDependencies: [
        { sourceModuleId: "m_a", targetModuleId: "m_b", weight: 1 },
        { sourceModuleId: "m_b", targetModuleId: "m_a", weight: 1 },
      ],
      internalEdges: [],
      fileToModuleId: new Map(),
      moduleFolderPath: new Map([
        ["m_a", "/tmp/a"],
        ["m_b", "/tmp/b"],
      ]),
    });
    expect(violations.some((v) => v.type === "circular-dependency")).toBe(true);
  });
});
