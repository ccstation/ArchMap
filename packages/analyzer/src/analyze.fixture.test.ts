import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { analyzeRepository } from "./analyze.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, "../../../fixtures/mini-repo");

describe("analyzeRepository", () => {
  it(
    "produces doc-shaped snapshot: modules, dependencies, promoted seams, visibility",
    async () => {
      const s = await analyzeRepository({ repoPath: fixtureRoot, name: "mini-repo" });
      expect(s.meta.graphVersion).toBe(2);
      expect(s.analysisMeta.thresholds.moduleCandidate).toBe(60);
      expect(s.analysisMeta.thresholds.seamPromotion).toBe(65);
      expect(s.analysisMeta.thresholds.visibilityCollapseBelow).toBe(50);
      expect(s.modules.length).toBeGreaterThan(0);
      expect(s.fileDependencies.length).toBeGreaterThan(0);
      expect(s.moduleDependencies.length).toBeGreaterThan(0);
      expect(s.seams.length).toBeGreaterThan(0);
      for (const seam of s.seams) {
        expect(seam.score?.seam).toBeDefined();
        expect(seam.score!.seam).toBeGreaterThanOrEqual(s.analysisMeta.thresholds.seamPromotion);
        expect(seam.confidence).toBeDefined();
      }
      const auth = s.modules.find((m) => m.name === "auth");
      const users = s.modules.find((m) => m.name === "users");
      expect(auth?.score.moduleCandidate).toBeGreaterThanOrEqual(60);
      expect(users?.score.moduleCandidate).toBeGreaterThanOrEqual(60);
      for (const el of s.elements) {
        expect(el.role).toBeDefined();
        expect(el.visibility.collapsedByDefault).toBe(
          el.visibility.surfaceVisibilityScore < s.analysisMeta.thresholds.visibilityCollapseBelow,
        );
      }
    },
    120_000,
  );
});
