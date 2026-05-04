import { z } from "zod";

export const dependencyTypeSchema = z.enum([
  "import",
  "route",
  "service",
  "event",
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

export const repositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  language: z.string().optional(),
  framework: z.string().optional().nullable(),
  scanTime: z.string(),
  commitHash: z.string().optional().nullable(),
});

export const moduleSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  folderPath: z.string(),
  inferredConfidence: z.number().min(0).max(1),
  parentModuleId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export const elementSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  type: elementTypeSchema,
  name: z.string(),
  filePath: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const fileDependencySchema = z.object({
  id: z.string(),
  sourceFilePath: z.string(),
  targetFilePath: z.string(),
  type: dependencyTypeSchema,
  importSpecifier: z.string().optional(),
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

export const seamSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  fromModuleId: z.string(),
  toModuleId: z.string(),
  seamType: seamTypeSchema,
  strength: z.number(),
  evidenceCount: z.number(),
});

export const violationSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  moduleId: z.string().optional().nullable(),
  type: violationTypeSchema,
  severity: severitySchema,
  message: z.string(),
  moduleIds: z.array(z.string()).optional(),
  evidence: z.record(z.unknown()).optional(),
});

export const snapshotMetaSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  commitHash: z.string().optional().nullable(),
  createdAt: z.string(),
  graphVersion: z.number(),
});

export const aiSummarySchema = z.object({
  moduleSummaries: z.record(z.string(), z.string()).optional(),
  relationshipSummaries: z.record(z.string(), z.string()).optional(),
  generatedAt: z.string().optional(),
});

export const moduleOverridesSchema = z.object({
  /** moduleId -> display name */
  rename: z.record(z.string(), z.string()).optional(),
  /** file path prefix -> target module id */
  fileToModule: z.record(z.string(), z.string()).optional(),
});

export const snapshotSchema = z.object({
  meta: snapshotMetaSchema,
  repository: repositorySchema,
  modules: z.array(moduleSchema),
  elements: z.array(elementSchema),
  fileDependencies: z.array(fileDependencySchema),
  moduleDependencies: z.array(moduleDependencySchema),
  seams: z.array(seamSchema),
  violations: z.array(violationSchema),
  ai: aiSummarySchema.optional(),
  overrides: moduleOverridesSchema.optional(),
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
