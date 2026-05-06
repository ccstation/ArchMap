import { z } from "zod";

export const dependencyTypeSchema = z.enum([
  "import",
  "route",
  "service",
  "event",
  "api",
  "unknown",
]);

export const elementTypeSchema = z.enum([
  "file",
  "class",
  "function",
  "component",
  "route",
  "service",
  "model",
  "other",
]);

export const architecturalRoleSchema = z.enum([
  "route",
  "controller",
  "facade",
  "service",
  "domain model",
  "repository",
  "adapter",
  "event producer",
  "event consumer",
  "store",
  "UI component",
  "util",
  "constants",
  "types",
  "generated",
  "test",
  "unknown",
]);

export const seamTypeSchema = z.enum([
  "import",
  "route",
  "service",
  "event",
  "api",
  "data",
  "unknown",
]);

export const violationTypeSchema = z.enum([
  "circular-dependency",
  "deep-import",
  "cross-boundary",
  "high-coupling",
  "other",
]);

export const severitySchema = z.enum(["low", "medium", "high"]);

export const evidenceEntrySchema = z.object({
  type: z.string(),
  weight: z.number().optional(),
  detail: z.string(),
});

export const analysisThresholdsSchema = z.object({
  moduleCandidate: z.number(),
  surfaceVisibility: z.number(),
  visibilityCollapseBelow: z.number(),
  seamPromotion: z.number(),
  noiseSuppression: z.number(),
});

export const analysisHeuristicsSchema = z.object({
  callerBasedVisibility: z.boolean(),
  moduleClustering: z.boolean(),
  frameworkAwareEntryPoints: z.boolean(),
});

export const analysisMetaSchema = z.object({
  analysisVersion: z.string(),
  thresholds: analysisThresholdsSchema,
  heuristics: analysisHeuristicsSchema,
  /** Optional note e.g. partial MVP role coverage */
  notes: z.array(z.string()).optional(),
});

export const repositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  /** Legacy single language label */
  language: z.string().optional(),
  languages: z.array(z.string()).optional(),
  /** Legacy single framework */
  framework: z.string().optional().nullable(),
  frameworks: z.array(z.string()).optional(),
  packageManager: z.string().optional().nullable(),
  scanTime: z.string(),
  commitHash: z.string().optional().nullable(),
});

export const moduleBoundariesSchema = z.object({
  rootPaths: z.array(z.string()),
  packages: z.array(z.string()).optional(),
  namespaces: z.array(z.string()).optional(),
});

export const moduleScoreSchema = z.object({
  moduleCandidate: z.number(),
  structuralBoundary: z.number().optional(),
  cohesion: z.number(),
  encapsulation: z.number(),
  domainNaming: z.number(),
  roleDiversity: z.number().optional(),
  utilityNoisePenalty: z.number().optional(),
});

export const moduleSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  /** Primary folder for UI grouping (absolute or normalized repo-relative) */
  folderPath: z.string(),
  kind: z.enum(["business-module", "technical-module", "root-bucket"]).optional(),
  source: z.enum(["inferred", "structural"]).optional(),
  /** 0–1, aligned with moduleCandidate / 100 */
  confidence: z.number().min(0).max(1),
  score: moduleScoreSchema,
  boundaries: moduleBoundariesSchema,
  entryPoints: z.array(z.string()).optional(),
  publicSurface: z.array(z.string()).optional(),
  elementIds: z.array(z.string()),
  evidence: z.array(evidenceEntrySchema),
  parentModuleId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  /** True when cluster scored below promotion threshold; files may still map here */
  promoted: z.boolean().optional(),
});

export const elementFlagsSchema = z.object({
  isPublicExport: z.boolean(),
  isFrameworkEntryPoint: z.boolean(),
  isGenerated: z.boolean(),
  isTestOnly: z.boolean(),
  /** Next.js classification (optional; omitted for non-Next repos). */
  isClientComponent: z.boolean().optional(),
  isServerComponent: z.boolean().optional(),
});

export const elementMetricsSchema = z.object({
  distinctCallerCount: z.number(),
  distinctCallingModuleCount: z.number(),
  fanIn: z.number(),
  fanOut: z.number(),
  downstreamReach: z.number(),
});

export const elementVisibilitySchema = z.object({
  surfaceVisibilityScore: z.number(),
  collapsedByDefault: z.boolean(),
});

export const elementSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  type: elementTypeSchema,
  name: z.string(),
  filePath: z.string(),
  role: architecturalRoleSchema,
  flags: elementFlagsSchema,
  metrics: elementMetricsSchema,
  visibility: elementVisibilitySchema,
  noiseScore: z.number(),
  evidence: z.array(evidenceEntrySchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const fileDependencySchema = z.object({
  id: z.string(),
  sourceFilePath: z.string(),
  targetFilePath: z.string(),
  sourceElementId: z.string().optional(),
  targetElementId: z.string().optional(),
  type: dependencyTypeSchema,
  importSpecifier: z.string().optional(),
  isCrossBoundary: z.boolean().optional(),
});

export const moduleDependencySchema = z.object({
  id: z.string(),
  sourceModuleId: z.string(),
  targetModuleId: z.string(),
  type: dependencyTypeSchema,
  weight: z.number(),
  evidenceCount: z.number(),
  evidence: z
    .array(
      z.object({
        sourceFilePath: z.string(),
        targetFilePath: z.string(),
      }),
    )
    .optional(),
});

export const seamScoreSchema = z.object({
  seam: z.number(),
  crossBoundaryStrength: z.number().optional(),
  interfaceEvidence: z.number().optional(),
  repeatedInteraction: z.number().optional(),
  roleBoundary: z.number().optional(),
  dependencyDirection: z.number().optional(),
  callerConvergence: z.number().optional(),
  noisePenalty: z.number().optional(),
});

export const seamSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  fromModuleId: z.string(),
  toModuleId: z.string(),
  seamType: seamTypeSchema,
  /** 0–1 convenience for graph APIs (seam score / 100) */
  strength: z.number(),
  evidenceCount: z.number(),
  confidence: z.number().min(0).max(1).optional(),
  score: seamScoreSchema.optional(),
  evidence: z.array(evidenceEntrySchema).optional(),
  viaElementIds: z.array(z.string()).optional(),
});

export const violationSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  moduleId: z.string().optional().nullable(),
  type: violationTypeSchema,
  severity: severitySchema,
  message: z.string(),
  moduleIds: z.array(z.string()).optional(),
  elementIds: z.array(z.string()).optional(),
  evidence: z.union([z.record(z.unknown()), z.array(evidenceEntrySchema)]).optional(),
});

export const snapshotMetaSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  commitHash: z.string().optional().nullable(),
  createdAt: z.string(),
  graphVersion: z.number(),
  analysisVersion: z.string().optional(),
});

export const aiSummarySchema = z.object({
  moduleSummaries: z.record(z.string(), z.string()).optional(),
  relationshipSummaries: z.record(z.string(), z.string()).optional(),
  generatedAt: z.string().optional(),
});

export const moduleOverridesSchema = z.object({
  rename: z.record(z.string(), z.string()).optional(),
  fileToModule: z.record(z.string(), z.string()).optional(),
});

export const importCallSiteSchema = z.object({
  otherModuleId: z.string(),
  callerFilePath: z.string(),
  calleeLabel: z.string(),
  line: z.number(),
  isCrossBoundary: z.boolean(),
});

export const moduleImportCallSitesSchema = z.object({
  outbound: z.array(importCallSiteSchema),
  inbound: z.array(importCallSiteSchema),
  outboundTotal: z.number(),
  inboundTotal: z.number(),
  outboundOmitted: z.number().optional(),
  inboundOmitted: z.number().optional(),
});

export const snapshotSchema = z.object({
  meta: snapshotMetaSchema,
  repository: repositorySchema,
  analysisMeta: analysisMetaSchema,
  modules: z.array(moduleSchema),
  elements: z.array(elementSchema),
  fileDependencies: z.array(fileDependencySchema),
  moduleDependencies: z.array(moduleDependencySchema),
  seams: z.array(seamSchema),
  violations: z.array(violationSchema),
  ai: aiSummarySchema.optional(),
  overrides: moduleOverridesSchema.optional(),
  /** Static import-linked call sites (direct / namespace-root calls across modules). */
  moduleImportCallSites: z.record(z.string(), moduleImportCallSitesSchema).optional(),
});

export type Repository = z.infer<typeof repositorySchema>;
export type ArchModule = z.infer<typeof moduleSchema>;
export type Element = z.infer<typeof elementSchema>;
export type FileDependency = z.infer<typeof fileDependencySchema>;
export type ModuleDependency = z.infer<typeof moduleDependencySchema>;
export type Seam = z.infer<typeof seamSchema>;
export type Violation = z.infer<typeof violationSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type SnapshotMeta = z.infer<typeof snapshotMetaSchema>;
export type DependencyType = z.infer<typeof dependencyTypeSchema>;
export type SeamType = z.infer<typeof seamTypeSchema>;
export type ViolationType = z.infer<typeof violationTypeSchema>;
export type AnalysisMeta = z.infer<typeof analysisMetaSchema>;
export type AnalysisThresholds = z.infer<typeof analysisThresholdsSchema>;
export type ArchitecturalRole = z.infer<typeof architecturalRoleSchema>;
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;
export type ImportCallSite = z.infer<typeof importCallSiteSchema>;
export type ModuleImportCallSites = z.infer<typeof moduleImportCallSitesSchema>;
export type ModuleScore = z.infer<typeof moduleScoreSchema>;
export type SeamScore = z.infer<typeof seamScoreSchema>;
