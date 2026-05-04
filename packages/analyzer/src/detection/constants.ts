import type { AnalysisMeta, AnalysisThresholds } from "@archmap/graph-model";

export const DEFAULT_THRESHOLDS: AnalysisThresholds = {
  moduleCandidate: 60,
  surfaceVisibility: 75,
  visibilityCollapseBelow: 50,
  seamPromotion: 65,
  noiseSuppression: 60,
};

export const ANALYSIS_VERSION = "0.1.0";

export function defaultAnalysisMeta(notes?: string[]): AnalysisMeta {
  return {
    analysisVersion: ANALYSIS_VERSION,
    thresholds: { ...DEFAULT_THRESHOLDS },
    heuristics: {
      callerBasedVisibility: true,
      moduleClustering: true,
      frameworkAwareEntryPoints: true,
    },
    ...(notes?.length ? { notes } : {}),
  };
}
