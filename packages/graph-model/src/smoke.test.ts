import { describe, it, expect } from "vitest";
import { snapshotSchema } from "./schemas.js";

describe("graph-model", () => {
  it("parses minimal snapshot", () => {
    const parsed = snapshotSchema.safeParse({
      meta: {
        id: "m1",
        repositoryId: "r1",
        createdAt: "2026-01-01T00:00:00.000Z",
        graphVersion: 2,
      },
      repository: {
        id: "r1",
        name: "n",
        path: "/p",
        scanTime: "2026-01-01T00:00:00.000Z",
      },
      analysisMeta: {
        analysisVersion: "0.1.0",
        thresholds: {
          moduleCandidate: 60,
          surfaceVisibility: 75,
          visibilityCollapseBelow: 50,
          seamPromotion: 65,
          noiseSuppression: 60,
        },
        heuristics: {
          callerBasedVisibility: true,
          moduleClustering: true,
          frameworkAwareEntryPoints: true,
        },
      },
      modules: [],
      elements: [],
      fileDependencies: [],
      moduleDependencies: [],
      seams: [],
      violations: [],
    });
    expect(parsed.success).toBe(true);
  });
});
