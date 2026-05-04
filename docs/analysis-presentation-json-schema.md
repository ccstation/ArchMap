# Analysis to Presentation JSON Schema

## Purpose
This document defines a JSON interface between two separate ArchMap stages:

1. **Analysis stage**
   - scans source code
   - extracts structure and dependencies
   - infers modules and seams
   - computes scores and violations

2. **Presentation stage**
   - consumes a JSON file
   - renders architecture views
   - supports filtering, zooming, drill-down, and inspection

This separation is a strong design choice because it:
- decouples analysis from UI
- makes results portable
- supports offline review
- allows batch analysis pipelines
- makes the presentation layer easier to iterate independently

## Design principles
- JSON should be self-contained for presentation
- schema should preserve evidence and scores
- schema should distinguish raw facts from inferred results
- schema should support multiple zoom levels
- schema should be versioned from the start

## Top-level shape

```json
{
  "schemaVersion": "1.0.0",
  "analysisId": "analysis_001",
  "generatedAt": "2026-05-04T01:00:00Z",
  "repository": {},
  "snapshot": {},
  "summary": {},
  "nodes": [],
  "edges": [],
  "groups": [],
  "seams": [],
  "violations": [],
  "views": {},
  "legend": {},
  "meta": {}
}
```

## Separation model

### Analysis stage output responsibilities
The analysis stage should produce:
- inferred modules
- elements and their roles
- dependencies
- seam candidates and promoted seams
- violations
- scores and evidence
- grouping relationships

### Presentation stage responsibilities
The presentation stage should:
- render nodes and edges
- apply filters and layouts
- support zooming and drill-down
- show evidence, scores, and details
- optionally allow local user annotations or overrides

## Schema sections

## 1. schemaVersion
```json
"schemaVersion": "1.0.0"
```
Used to manage compatibility between analysis and presentation engines.

## 2. analysisId
```json
"analysisId": "analysis_001"
```
A unique identifier for this analysis output.

## 3. repository
Describes the repository being analyzed.

```json
{
  "id": "repo_storefront",
  "name": "storefront-platform",
  "sourceType": "local-path",
  "sourceRef": "/repos/storefront-platform",
  "languages": ["TypeScript", "JavaScript"],
  "frameworks": ["Next.js"],
  "rootPackageManager": "npm"
}
```

## 4. snapshot
Captures the code state analyzed.

```json
{
  "id": "snap_001",
  "commitHash": "e52f14",
  "branch": "main",
  "createdAt": "2026-05-04T01:00:00Z"
}
```

## 5. summary
High-level counts and headline metrics.

```json
{
  "moduleCount": 12,
  "elementCount": 184,
  "visibleNodeCount": 29,
  "dependencyCount": 420,
  "seamCount": 18,
  "violationCount": 7,
  "riskScore": 68
}
```

## 6. nodes
Nodes are the main renderable units.

A node may represent:
- module
- submodule
- file
- external system
- entry point
- shared surface

### Node shape

```json
{
  "id": "node_mod_catalog",
  "kind": "module",
  "name": "Catalog",
  "label": "Catalog",
  "parentId": null,
  "groupIds": ["group_domain_core"],
  "path": "src/catalog",
  "role": "business-module",
  "visibility": {
    "defaultLevel": "system",
    "collapsedByDefault": false,
    "surfaceVisibilityScore": 92,
    "hiddenAtLevels": []
  },
  "metrics": {
    "fanIn": 7,
    "fanOut": 4,
    "elementCount": 26,
    "publicSurfaceCount": 8,
    "riskScore": 74
  },
  "inference": {
    "source": "inferred",
    "confidence": 0.84,
    "moduleCandidateScore": 84,
    "noiseScore": 12
  },
  "flags": {
    "isEntryPoint": false,
    "isPublicSurface": true,
    "isShared": true,
    "isExternal": false,
    "isGenerated": false,
    "isTestOnly": false
  },
  "tags": ["domain", "core"],
  "summary": "Owns product discovery, search, and product detail orchestration.",
  "evidence": [
    {
      "type": "folder-boundary",
      "detail": "Majority of files are under src/catalog",
      "weight": 0.8
    }
  ],
  "presentation": {
    "preferredShape": "rounded-rect",
    "preferredColor": "blue",
    "priority": 90
  }
}
```

### Notes
- `kind` is the renderable node type
- `role` is the architectural role
- `parentId` supports nested zoom or hierarchy
- `visibility` supports progressive disclosure
- `presentation` is optional but useful for UI defaults

## 7. edges
Edges are raw or promoted relationships between nodes.

### Edge shape

```json
{
  "id": "edge_001",
  "kind": "dependency",
  "sourceId": "node_mod_checkout",
  "targetId": "node_mod_catalog",
  "role": "import",
  "strength": 0.72,
  "crossBoundary": true,
  "metrics": {
    "dependencyCount": 8,
    "callerConvergence": 3
  },
  "flags": {
    "isSeam": true,
    "isSuppressed": false,
    "isDirectional": true
  },
  "inference": {
    "confidence": 0.79,
    "seamScore": 79,
    "noiseScore": 10
  },
  "summary": "Checkout uses Catalog pricing and product retrieval services.",
  "evidence": [
    {
      "type": "cross-module-imports",
      "detail": "8 imports cross from Checkout into Catalog",
      "weight": 0.8
    }
  ],
  "presentation": {
    "preferredStyle": "solid",
    "preferredColor": "yellow",
    "emphasis": "high"
  }
}
```

## 8. groups
Groups define higher-order organization used by the UI.

They may represent:
- domains
- layers
- packages
- teams
- bounded-context candidates

### Group shape

```json
{
  "id": "group_domain_core",
  "kind": "domain-group",
  "name": "Core commerce",
  "nodeIds": ["node_mod_catalog", "node_mod_checkout", "node_mod_customer"],
  "summary": "Core customer-facing commerce modules."
}
```

## 9. seams
Seams are promoted architectural boundary objects.

A seam is not just an edge. It is a first-class architectural concept with explanation and evidence.

### Seam shape

```json
{
  "id": "seam_catalog_checkout_pricing",
  "kind": "service-seam",
  "fromNodeId": "node_mod_checkout",
  "toNodeId": "node_mod_catalog",
  "viaNodeIds": ["node_file_catalog_facade"],
  "edgeIds": ["edge_001", "edge_002", "edge_003"],
  "score": 79,
  "confidence": 0.79,
  "severity": "medium",
  "summary": "Checkout depends on Catalog through pricing and product lookup services.",
  "evidence": [
    {
      "type": "shared-surface",
      "detail": "CatalogFacade is used by 3 Checkout call sites",
      "weight": 0.7
    }
  ],
  "flags": {
    "userConfirmed": false,
    "suppressed": false
  },
  "presentation": {
    "highlight": true,
    "color": "yellow",
    "badge": "hotspot"
  }
}
```

## 10. violations
Violations are findings the UI can surface directly.

### Violation shape

```json
{
  "id": "viol_001",
  "type": "deep-import",
  "severity": "medium",
  "nodeIds": ["node_mod_checkout", "node_file_catalog_internal_pricing"],
  "edgeIds": ["edge_009"],
  "message": "Checkout imports Catalog internal pricing implementation directly.",
  "recommendation": "Route the interaction through a stable Catalog facade.",
  "evidence": [
    {
      "type": "cross-boundary-internal-access",
      "detail": "checkout/service.ts imports src/catalog/internal/pricing.ts"
    }
  ]
}
```

## 11. views
This section tells the presentation layer what precomputed views are available.

### Example

```json
{
  "system": {
    "level": "system",
    "nodeIds": ["node_mod_catalog", "node_mod_checkout", "node_mod_customer"],
    "edgeIds": ["edge_001", "edge_005"],
    "seamIds": ["seam_catalog_checkout_pricing"]
  },
  "module:Catalog": {
    "level": "module",
    "focusNodeId": "node_mod_catalog",
    "nodeIds": ["node_mod_catalog", "node_file_catalog_facade", "node_file_catalog_store"],
    "edgeIds": ["edge_021", "edge_022"]
  }
}
```

### Why this matters
The analyzer can precompute useful slices so the presentation layer does not need to rebuild views from scratch.

## 12. legend
Defines meaning for colors, shapes, and styles.

```json
{
  "nodeKinds": {
    "module": "Architectural module",
    "file": "Source file",
    "external": "External dependency or system"
  },
  "edgeRoles": {
    "import": "Static dependency",
    "event": "Event-driven interaction",
    "api": "API or service boundary"
  },
  "severityColors": {
    "low": "blue",
    "medium": "yellow",
    "high": "red"
  }
}
```

## 13. meta
Metadata about heuristics and generation settings.

```json
{
  "analyzer": {
    "name": "archmap-analyzer",
    "version": "0.1.0"
  },
  "heuristics": {
    "callerBasedVisibility": true,
    "moduleClustering": true,
    "frameworkAwareEntryPoints": true,
    "noiseSuppression": true
  },
  "thresholds": {
    "moduleCandidate": 60,
    "surfaceVisibility": 75,
    "seamPromotion": 65,
    "noiseSuppression": 60
  }
}
```

## Schema design recommendations

### Keep two truth layers
The JSON should preserve both:
1. **facts**
   - paths
   - dependencies
   - counts
   - roles
2. **inferences**
   - module candidate scores
   - seam scores
   - noise scores
   - confidence

This makes the presentation explainable.

### Prefer stable IDs
IDs should remain stable across runs where possible.
This matters for:
- diffing
- annotation
- user overrides
- snapshots

### Treat seams as first-class objects
Do not force the UI to infer seams only from edges.
Promoted seams should be explicit objects.

### Keep presentation hints optional
The presentation layer should be able to ignore these if it wants.
But they are useful for default rendering.

## Recommended next split
I suggest treating the interface as two related schemas:

### A. Analysis exchange schema
Detailed, rich, evidence-heavy, canonical.

### B. Presentation view schema
Optional derived JSON optimized for rendering and performance.

For MVP, they can still be one file if that is simpler.

## Minimal MVP schema
If you want a smaller first version, the minimum useful shape is:

```json
{
  "schemaVersion": "1.0.0",
  "repository": {},
  "snapshot": {},
  "nodes": [],
  "edges": [],
  "seams": [],
  "violations": [],
  "meta": {}
}
```

## Conclusion
Separating analysis and presentation through a versioned JSON contract is a strong architecture choice.

The schema above should give ArchMap:
- a portable analysis artifact
- a stable renderer interface
- enough evidence for explainability
- enough structure for multiple UI views and future diffing
