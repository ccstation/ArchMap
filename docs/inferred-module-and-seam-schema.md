# Inferred Module and Seam Schema Draft

## Purpose
This document proposes a JSON-oriented schema for the main architecture objects ArchMap will produce during analysis.

The goal is to support:
- deterministic analysis output
- explainable inference
- UI rendering
- future editing and review workflows

## Design principles
- keep the schema normalized enough for evolution
- preserve evidence and confidence, not just final labels
- separate inference result from user overrides
- support snapshots over time

## Top-level analysis document

```json
{
  "repository": {},
  "snapshot": {},
  "modules": [],
  "elements": [],
  "dependencies": [],
  "seams": [],
  "violations": [],
  "analysisMeta": {}
}
```

## Repository

```json
{
  "id": "repo_storefront",
  "name": "storefront-platform",
  "sourceType": "local-path",
  "sourcePath": "/repos/storefront-platform",
  "language": ["TypeScript", "JavaScript"],
  "frameworks": ["Next.js"],
  "packageManager": "npm"
}
```

## Snapshot

```json
{
  "id": "snap_2026_05_04_001",
  "repositoryId": "repo_storefront",
  "commitHash": "e52f14",
  "createdAt": "2026-05-04T01:00:00Z",
  "analysisVersion": "0.1.0"
}
```

## Module
A module is an inferred or user-adjusted architectural unit.

```json
{
  "id": "mod_catalog",
  "snapshotId": "snap_2026_05_04_001",
  "name": "Catalog",
  "kind": "business-module",
  "source": "inferred",
  "confidence": 0.84,
  "score": {
    "moduleCandidate": 84,
    "cohesion": 80,
    "encapsulation": 72,
    "domainNaming": 87,
    "noisePenalty": 12
  },
  "boundaries": {
    "rootPaths": ["src/catalog"],
    "packages": ["web-app"],
    "namespaces": []
  },
  "entryPoints": ["el_catalog_routes_index"],
  "publicSurface": ["el_catalog_facade", "el_catalog_search_service"],
  "elementIds": ["el_catalog_routes_index", "el_catalog_facade", "el_catalog_store"],
  "tags": ["domain", "core"],
  "evidence": [
    {
      "type": "folder-boundary",
      "weight": 0.8,
      "detail": "Majority of files located under src/catalog"
    },
    {
      "type": "internal-cohesion",
      "weight": 0.7,
      "detail": "High internal import density compared to external dependencies"
    }
  ],
  "overrides": {
    "userNamed": false,
    "userMerged": false,
    "userSplit": false
  }
}
```

## Element
An element is a file or finer-grained code entity.

```json
{
  "id": "el_catalog_facade",
  "snapshotId": "snap_2026_05_04_001",
  "moduleId": "mod_catalog",
  "name": "CatalogFacade",
  "kind": "file",
  "role": "facade",
  "path": "src/catalog/CatalogFacade.ts",
  "visibility": {
    "surfaceVisibilityScore": 81,
    "collapsedByDefault": false,
    "zoomLevel": "module"
  },
  "metrics": {
    "distinctCallerCount": 4,
    "distinctCallingModuleCount": 2,
    "fanIn": 4,
    "fanOut": 6,
    "downstreamReach": 21
  },
  "flags": {
    "isPublicExport": true,
    "isFrameworkEntryPoint": false,
    "isGenerated": false,
    "isTestOnly": false
  },
  "evidence": [
    {
      "type": "multi-caller",
      "weight": 0.6,
      "detail": "Referenced by 4 distinct callers"
    },
    {
      "type": "public-export",
      "weight": 0.9,
      "detail": "Re-exported from catalog/index.ts"
    }
  ]
}
```

## Dependency
A dependency represents a directional relationship between elements or modules.

```json
{
  "id": "dep_001",
  "snapshotId": "snap_2026_05_04_001",
  "sourceElementId": "el_checkout_service",
  "targetElementId": "el_catalog_facade",
  "sourceModuleId": "mod_checkout",
  "targetModuleId": "mod_catalog",
  "kind": "import",
  "strength": 0.72,
  "isCrossBoundary": true,
  "evidence": [
    {
      "type": "import-statement",
      "detail": "checkout/service.ts imports CatalogFacade"
    }
  ]
}
```

## Seam
A seam is a promoted, meaningful boundary interaction.

```json
{
  "id": "seam_catalog_checkout_pricing",
  "snapshotId": "snap_2026_05_04_001",
  "fromModuleId": "mod_checkout",
  "toModuleId": "mod_catalog",
  "kind": "service-seam",
  "source": "inferred",
  "confidence": 0.79,
  "score": {
    "seam": 79,
    "crossBoundaryStrength": 78,
    "interfaceEvidence": 82,
    "callerConvergence": 65,
    "noisePenalty": 10
  },
  "viaElementIds": ["el_catalog_facade"],
  "dependencyIds": ["dep_001", "dep_002", "dep_003"],
  "summary": "Checkout interacts with Catalog through pricing and product retrieval services.",
  "evidence": [
    {
      "type": "cross-module-calls",
      "weight": 0.8,
      "detail": "Three cross-module calls converge on CatalogFacade"
    },
    {
      "type": "role-boundary",
      "weight": 0.7,
      "detail": "Target element classified as facade"
    }
  ],
  "flags": {
    "userConfirmed": false,
    "isSuppressed": false
  }
}
```

## Violation

```json
{
  "id": "viol_001",
  "snapshotId": "snap_2026_05_04_001",
  "type": "deep-import",
  "severity": "medium",
  "moduleIds": ["mod_checkout", "mod_catalog"],
  "elementIds": ["el_checkout_service", "el_catalog_internal_pricing"],
  "message": "Checkout imports Catalog internal pricing implementation directly.",
  "evidence": [
    {
      "type": "cross-boundary-internal-access",
      "detail": "checkout/service.ts imports src/catalog/internal/pricing.ts"
    }
  ]
}
```

## Analysis metadata

```json
{
  "heuristics": {
    "callerBasedVisibility": true,
    "moduleClustering": true,
    "frameworkAwareEntryPoints": true
  },
  "thresholds": {
    "moduleCandidate": 60,
    "surfaceVisibility": 75,
    "seamPromotion": 65,
    "noiseSuppression": 60
  }
}
```

## Notes on overrides
User changes should not erase inference evidence.

A future model should support:
- renamed modules
- merged modules
- split modules
- suppressed seams
- confirmed seams
- custom rules

This can be represented as a separate overrides layer or patch document.

## Recommendation
For MVP, start with:
- module
- element
- dependency
- seam
- violation
- snapshot

and keep the evidence fields, because explainability is critical for trust.
