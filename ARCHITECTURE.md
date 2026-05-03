# ArchMap System Architecture

## Purpose
This document outlines a proposed technical architecture for ArchMap, a tool that analyzes source code and generates an explorable architecture map of a software system.

## High-level goals
The system should:
- ingest an existing repository
- analyze structure and dependencies
- infer modules and seams
- generate a graph model of the architecture
- surface risks and violations
- present the result in an interactive UI

## High-level architecture
ArchMap can be organized into five main layers:

1. Repository ingestion
2. Analysis engine
3. Architecture model and storage
4. API layer
5. Frontend visualization

## 1. Repository ingestion
This layer is responsible for loading a repository into the analysis pipeline.

### Responsibilities
- accept a local path, uploaded archive, or Git repository
- detect language and framework
- identify files relevant for analysis
- normalize file paths and metadata
- exclude generated or ignored files

### Inputs
- local repository path
- uploaded repository bundle
- Git clone URL in future versions

### Outputs
- repository manifest
- filtered file inventory
- basic project metadata

### Notes
For the first version, local repository analysis is the simplest starting point.

## 2. Analysis engine
This is the core of the product. It parses code, extracts relationships, and builds the raw architecture model.

### Subsystems

#### 2.1 Parser layer
Responsible for syntax-aware parsing of source files.

For MVP:
- TypeScript compiler API or ts-morph
- JavaScript and TypeScript support first

Possible extracted entities:
- files
- folders
- imports and exports
- classes
- functions
- components
- routes
- services
- stores
- models

#### 2.2 Dependency extraction
Builds relationships between elements.

Possible dependency types:
- imports
- function or method calls where practical
- route handlers
- state read/write relationships
- event emissions and listeners
- service-to-service usage

#### 2.3 Module inference engine
Infers modules from code structure and graph patterns.

Possible heuristics:
- top-level folder boundaries
- import cohesion
- graph clustering
- naming conventions
- framework-aware patterns
- entry-point and public-surface detection

#### 2.4 Seam detection
Seams represent meaningful boundaries between modules.

Seam types may include:
- static import seam
- route seam
- event seam
- service seam
- API seam
- data seam

#### 2.5 Rule and health engine
Surfaces structural warnings and insights.

Examples:
- circular dependencies
- deep imports
- high coupling
- layer violations
- unstable dependency direction
- low cohesion modules
- oversized public surface

## 3. Architecture model and storage
This layer stores the normalized representation of the codebase architecture.

## Core entities

### Repository
Represents a scanned codebase.

Fields may include:
- id
- name
- path
- framework
- language
- scan time
- commit hash

### Module
Represents an inferred or user-defined architectural unit.

Fields may include:
- id
- repositoryId
- name
- description
- parentModuleId
- inferredConfidence
- tags

### Element
Represents a contained code element.

Fields may include:
- id
- moduleId
- type
- name
- filePath
- metadata

### Dependency
Represents a directed relationship between two elements or modules.

Fields may include:
- id
- sourceId
- targetId
- type
- weight
- metadata

### Seam
Represents a boundary interaction between modules.

Fields may include:
- id
- fromModuleId
- toModuleId
- seamType
- strength
- evidence

### Violation
Represents an architecture warning or breach.

Fields may include:
- id
- repositoryId
- moduleId
- severity
- type
- message
- evidence

### Snapshot
Represents an architecture state at a point in time.

Fields may include:
- id
- repositoryId
- commitHash
- createdAt
- graphVersion

## Storage options
### MVP
- JSON artifacts on disk
- SQLite or lightweight Postgres if persistence is needed early

### Later
- Postgres for structured persistence
- optional graph-oriented store if graph queries become central

## 4. API layer
Provides the frontend with access to analysis results.

### Responsibilities
- trigger scans
- fetch repository summaries
- fetch graph views
- fetch module details
- fetch seams and violations
- fetch snapshot diffs in later versions

### Suggested API shape
- `POST /repositories/analyze`
- `GET /repositories/:id`
- `GET /repositories/:id/graph`
- `GET /repositories/:id/modules`
- `GET /modules/:id`
- `GET /repositories/:id/violations`
- `GET /repositories/:id/seams`

### API style
- REST is fine for MVP
- GraphQL may be useful later if the UI needs highly selective graph queries

## 5. Frontend visualization
The frontend should make the architecture easy to understand and navigate.

### Main surfaces

#### 5.1 Repository overview
- high-level module graph
- filters by dependency or risk
- legend and health summary

#### 5.2 Module detail view
- module description
- contained files and elements
- inbound and outbound dependencies
- seams to other modules
- violations and risks

#### 5.3 Seam inspector
- list and classify cross-module interactions
- show evidence for each seam

#### 5.4 Violation panel
- display cycles, deep imports, coupling risks, and other warnings

### Visualization choices
Good candidates:
- React Flow
- Cytoscape

Recommended approach:
- module-level graph first
- progressively reveal lower-level details
- avoid showing file-level chaos by default

## Data flow
A typical user flow:
1. User selects a repository.
2. Ingestion layer scans files.
3. Analysis engine parses the code and builds a dependency graph.
4. Module inference groups elements into modules.
5. Seam and rule engines generate insights.
6. Results are stored as a snapshot.
7. API serves the graph and detail data.
8. Frontend renders the interactive architecture view.

## MVP deployment model
### Simplest starting point
- single app deployment
- backend and frontend in one Next.js project or adjacent services
- local-first analysis execution
- JSON or SQLite persistence

### Alternative
- frontend app plus analysis worker service if scans become slow

## Performance considerations
- large repositories can produce too many nodes and edges
- parsing should be incremental where possible
- graph generation should support caching
- UI should default to module-level abstraction
- expensive analyses should run asynchronously

## Security and privacy
This matters because source code is sensitive.

Recommendations:
- local-first analysis for MVP
- no code leaves the machine by default
- AI summaries should be optional and explicit
- redact or avoid shipping raw source where unnecessary

## Suggested directory structure
A possible future project structure:

```text
ArchMap/
  apps/
    web/
  packages/
    analyzer/
    graph-model/
    rules/
    shared/
    ui/
  docs/
  fixtures/
```

## Open design decisions
- should analysis happen in-process or through background jobs?
- what is the right default granularity for the graph?
- should module inference be deterministic only, AI-assisted, or hybrid?
- should the system support manual architecture edits in MVP?
- how much framework specialization should be built in early?

## Recommendation
For the first implementation:
- target TypeScript and JavaScript only
- analyze locally
- persist a normalized JSON graph
- visualize modules first, not files first
- keep AI summaries optional and secondary to deterministic analysis

This keeps the first version focused and technically realistic.
