import { z } from "zod";

/** API response shapes aligned with API.md */

export const analyzeRequestSchema = z.object({
  name: z.string().optional(),
  source: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("local-path"),
      path: z.string(),
    }),
  ]),
});

export const analyzeResponseSchema = z.object({
  repositoryId: z.string(),
  analysisId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
});

export const analysisStatusSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  progress: z
    .object({
      stage: z.string(),
      percent: z.number(),
    })
    .optional(),
  error: z.string().optional(),
});

export const graphNodeSchema = z.object({
  id: z.string(),
  type: z.literal("module"),
  name: z.string(),
  risk: z.enum(["low", "medium", "high"]).optional(),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
});

export const graphResponseSchema = z.object({
  snapshotId: z.string(),
  level: z.enum(["module", "file", "element"]),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

export const moduleListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  inferredConfidence: z.number(),
  inboundCount: z.number(),
  outboundCount: z.number(),
  violationCount: z.number(),
});

export const modulesListResponseSchema = z.object({
  items: z.array(moduleListItemSchema),
});

export const moduleDetailResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  contents: z.array(
    z.object({
      type: z.enum(["file", "symbol"]),
      path: z.string(),
      name: z.string().optional(),
    }),
  ),
  publicSurface: z.array(z.string()),
  inboundDependencies: z.array(z.string()),
  outboundDependencies: z.array(z.string()),
  risks: z.array(
    z.object({
      severity: z.enum(["low", "medium", "high"]),
      message: z.string(),
    }),
  ),
  aiSummary: z.string().optional(),
});

export const seamsListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      fromModuleId: z.string(),
      toModuleId: z.string(),
      seamType: z.string(),
      strength: z.number(),
      evidenceCount: z.number(),
    }),
  ),
});

export const violationsListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      message: z.string(),
      moduleIds: z.array(z.string()).optional(),
    }),
  ),
});

export const snapshotsListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      commitHash: z.string().optional().nullable(),
      createdAt: z.string(),
    }),
  ),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
