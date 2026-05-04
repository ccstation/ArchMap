import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { analyzeRepository } from "./analyze.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, "../../../fixtures/mini-repo");

describe("analyzeRepository", () => {
  it(
    "produces modules and file dependencies for fixture",
    async () => {
      const s = await analyzeRepository({ repoPath: fixtureRoot, name: "mini-repo" });
      expect(s.modules.length).toBeGreaterThan(0);
      expect(s.fileDependencies.length).toBeGreaterThan(0);
      expect(s.seams.length).toBeGreaterThan(0);
    },
    120_000,
  );
});
