import type { ArchitecturalRole, Element } from "@archmap/graph-model";
import type { SourceFile } from "ts-morph";
import type { FrameworkInfo } from "./framework.js";

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, "/").toLowerCase();
}

export function classifyRole(
  relPath: string,
  framework: FrameworkInfo,
): ArchitecturalRole {
  const lower = normalizeRel(relPath);
  if (
    lower.includes("__tests__") ||
    lower.includes("/test/") ||
    /\.(test|spec)\.(m|c)?(t|j)sx?$/.test(lower)
  ) {
    return "test";
  }
  if (
    lower.includes("/.generated/") ||
    lower.includes("/generated/") ||
    lower.endsWith(".gen.ts") ||
    lower.includes("/codegen/")
  ) {
    return "generated";
  }
  if (lower.endsWith(".d.ts") && !lower.endsWith("index.d.ts")) return "types";
  if (/\/constants\//.test(lower) || /(^|\/)constants\.(m|c)?(t|j)sx?$/.test(lower)) {
    return "constants";
  }
  if (
    /(^|\/)types?\/./.test(lower) ||
    /\.types\.(m|c)?(t|j)sx?$/.test(lower) ||
    /(^|\/)type[s]?\//
      .test(lower)
  ) {
    return "types";
  }
  if (/(^|\/)(util|utils|helpers)\//.test(lower) || /(util|helper)s?\.(m|c)?(t|j)sx?$/.test(lower)) {
    return "util";
  }
  if (lower.includes("repository") || /repo\.(t|j)sx?$/.test(lower)) return "repository";
  if (lower.includes("adapter")) return "adapter";
  if (lower.includes("facade")) return "facade";
  if (lower.includes("consumer") || lower.includes("subscriber")) return "event consumer";
  if (lower.includes("producer") || lower.includes("publisher")) return "event producer";
  if (framework.hasAppRouter) {
    if (
      /(^|\/)app\/.*(page|layout|route)\.(m|c)?(t|j)sx?$/.test(lower) ||
      /(^|\/)src\/app\/.*(page|layout|route)\.(m|c)?(t|j)sx?$/.test(lower)
    ) {
      return "route";
    }
  }
  if (framework.hasPagesRouter && /(^|\/)pages\/./.test(lower)) return "route";
  if (lower.includes("controller")) return "controller";
  if (lower.includes("store") || lower.includes("redux") || lower.includes("zustand")) {
    return "store";
  }
  if (lower.includes("service")) return "service";
  if (lower.includes("model") || /\/models?\//.test(lower)) return "domain model";
  if (lower.endsWith(".tsx")) return "UI component";
  return "unknown";
}

export function computeElementFlags(
  sf: SourceFile,
  relPath: string,
  role: ArchitecturalRole,
): Element["flags"] {
  const text = sf.getFullText();
  const hasNamedExport =
    /export\s+(?:async\s+)?function\s+/.test(text) ||
    /export\s+const\s+/.test(text) ||
    /export\s+class\s+/.test(text) ||
    /export\s+\{/.test(text);
  const hasDefault = /export\s+default/.test(text);
  const lower = normalizeRel(relPath);
  const isTestOnly =
    lower.includes("__tests__") ||
    /\.(test|spec)\.(m|c)?(t|j)sx?$/.test(lower) ||
    lower.includes("/test/");
  const isGenerated =
    lower.includes("/generated/") ||
    lower.includes("/.generated/") ||
    lower.endsWith(".gen.ts");
  const isFrameworkEntryPoint = role === "route" || role === "controller";
  return {
    isPublicExport: hasNamedExport || hasDefault,
    isFrameworkEntryPoint,
    isGenerated,
    isTestOnly,
  };
}
