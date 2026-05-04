export {
  analyzeRepository,
  writeSnapshot,
  type AnalyzeOptions,
} from "./analyze.js";
export { ingestRepository } from "./ingest.js";
export { buildFileGraph } from "./file-graph.js";
export { inferModules, extractPublicSurface } from "./modules.js";
export { runRules, buildAdjacency, findCycleGroups } from "./rules.js";
