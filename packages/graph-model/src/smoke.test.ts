import { describe, it, expect } from "vitest";
import { snapshotSchema } from "./schemas.js";

describe("graph-model", () => {
  it("parses minimal snapshot", () => {
    const parsed = snapshotSchema.safeParse({
      meta: {
        id: "m1",
        repositoryId: "r1",
        createdAt: "2026-01-01T00:00:00.000Z",
        graphVersion: 1,
      },
      repository: {
        id: "r1",
        name: "n",
        path: "/p",
        scanTime: "2026-01-01T00:00:00.000Z",
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
