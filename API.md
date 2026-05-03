# ArchMap API Draft

## Purpose
This document sketches a first API shape for ArchMap. It is intentionally lightweight and intended to guide implementation rather than freeze the contract too early.

## Principles
- simple enough for MVP
- optimized for architecture exploration workflows
- separate analysis triggering from result retrieval
- support future snapshot comparison

## API style
For MVP, use REST.

GraphQL can be reconsidered later if the frontend needs more flexible graph querying.

## Core resources
- repositories
- analyses
- modules
- seams
- violations
- snapshots

## Endpoints

### 1. Analyze a repository
`POST /repositories/analyze`

Starts analysis for a repository.

#### Request body example
```json
{
  "name": "sample-repo",
  "source": {
    "type": "local-path",
    "path": "/path/to/repo"
  }
}
```

#### Response example
```json
{
  "repositoryId": "repo_123",
  "analysisId": "analysis_456",
  "status": "queued"
}
```

---

### 2. Get repository summary
`GET /repositories/:repositoryId`

Returns high-level repository information.

#### Response example
```json
{
  "id": "repo_123",
  "name": "sample-repo",
  "language": "TypeScript",
  "framework": "Next.js",
  "latestSnapshotId": "snap_789",
  "status": "ready"
}
```

---

### 3. Get analysis status
`GET /analyses/:analysisId`

Returns current analysis job state.

#### Response example
```json
{
  "id": "analysis_456",
  "repositoryId": "repo_123",
  "status": "running",
  "progress": {
    "stage": "module-inference",
    "percent": 62
  }
}
```

---

### 4. Get architecture graph
`GET /repositories/:repositoryId/graph`

Returns the normalized graph for the latest or specified snapshot.

#### Query params
- `snapshotId` optional
- `level` optional, values like `module`, `file`, `element`

#### Response example
```json
{
  "snapshotId": "snap_789",
  "level": "module",
  "nodes": [
    {
      "id": "module_auth",
      "type": "module",
      "name": "Auth",
      "risk": "medium"
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "module_auth",
      "target": "module_user",
      "type": "import"
    }
  ]
}
```

---

### 5. List modules
`GET /repositories/:repositoryId/modules`

Returns the module list for a repository.

#### Response example
```json
{
  "items": [
    {
      "id": "module_auth",
      "name": "Auth",
      "description": "Authentication and session management",
      "inferredConfidence": 0.88,
      "inboundCount": 4,
      "outboundCount": 2,
      "violationCount": 1
    }
  ]
}
```

---

### 6. Get module details
`GET /modules/:moduleId`

Returns detailed information about one module.

#### Response example
```json
{
  "id": "module_auth",
  "name": "Auth",
  "description": "Authentication and session management",
  "contents": [
    {
      "type": "file",
      "path": "src/auth/service.ts"
    }
  ],
  "publicSurface": [
    "login",
    "logout",
    "refreshSession"
  ],
  "inboundDependencies": [
    "module_user"
  ],
  "outboundDependencies": [
    "module_session"
  ],
  "risks": [
    {
      "severity": "medium",
      "message": "Deep import from another module detected"
    }
  ]
}
```

---

### 7. List seams
`GET /repositories/:repositoryId/seams`

Returns cross-module seams.

#### Response example
```json
{
  "items": [
    {
      "id": "seam_1",
      "fromModuleId": "module_auth",
      "toModuleId": "module_user",
      "seamType": "service",
      "strength": 0.72,
      "evidenceCount": 5
    }
  ]
}
```

---

### 8. List violations
`GET /repositories/:repositoryId/violations`

Returns architecture warnings and breaches.

#### Query params
- `severity` optional
- `type` optional

#### Response example
```json
{
  "items": [
    {
      "id": "viol_1",
      "type": "circular-dependency",
      "severity": "high",
      "message": "Circular dependency detected between Auth and User",
      "moduleIds": ["module_auth", "module_user"]
    }
  ]
}
```

---

### 9. List snapshots
`GET /repositories/:repositoryId/snapshots`

Returns saved architecture snapshots.

#### Response example
```json
{
  "items": [
    {
      "id": "snap_789",
      "commitHash": "abc123",
      "createdAt": "2026-05-03T06:00:00Z"
    }
  ]
}
```

---

### 10. Compare snapshots
`GET /repositories/:repositoryId/diff`

Future endpoint for architecture comparison.

#### Query params
- `baseSnapshotId`
- `targetSnapshotId`

#### Response example
```json
{
  "addedModules": [],
  "removedModules": [],
  "changedDependencies": [],
  "newViolations": []
}
```

## Error shape
Suggested common error format:

```json
{
  "error": {
    "code": "INVALID_SOURCE",
    "message": "Repository source path does not exist"
  }
}
```

## Notes
- analysis may be synchronous for tiny repos and asynchronous for larger repos
- snapshot support can begin as simple local artifacts
- the API should expose both machine-friendly structures and user-facing summaries where useful
