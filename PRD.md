# ArchMap PRD

## Product name
ArchMap

## Tagline
Visualize your codebase architecture from source code.

## Summary
ArchMap is an application that analyzes an existing repository and turns it into a living architecture map. It helps developers and architects understand how a system is structured by showing modules, seams, dependencies, contents, and architectural risks.

## Problem
As applications grow, architecture becomes harder to understand.

Teams often face these problems:
- architecture lives in people's heads
- diagrams become stale quickly
- onboarding into a large codebase is slow
- module boundaries are unclear
- dependencies and coupling are hard to reason about
- refactoring is risky without a shared mental model

Existing tools often provide either dependency graphs, code metrics, or framework-specific views, but not a clear module-first architecture map that helps teams understand boundaries and seams.

## Vision
ArchMap gives teams a living, explorable view of software architecture generated directly from real code, so they can understand, communicate, and improve system design with confidence.

## Goals
- help teams understand the real architecture of an existing codebase
- infer modules and boundaries from source code
- visualize seams and dependencies between modules
- show what each module contains
- surface architecture risks and violations
- reduce the gap between intended architecture and actual implementation

## Non-goals for MVP
- full semantic understanding of every programming language
- automatic code refactoring
- runtime tracing as a required dependency
- enterprise governance workflows
- perfect architecture inference without human adjustment

## Target users
- engineering leads
- software architects
- staff and principal engineers
- developers onboarding into large repositories
- teams planning major refactors
- consultants performing technical due diligence or architecture reviews

## Core use cases
1. A developer scans a repository and sees the high-level modules.
2. An architect inspects seams and dependencies between modules.
3. A new team member explores what each module contains.
4. A lead engineer identifies circular dependencies and boundary violations.
5. A team compares architecture snapshots over time.

## Product principles
- generated from real code, not hand-maintained diagrams
- useful within minutes for an existing repository
- architecture-first, not just file-tree-first
- explain boundaries and interactions clearly
- provide actionable insights, not only visual output

## Key concepts

### Module
A logical area of the system organized around responsibility, capability, or ownership.

### Seam
A boundary or interaction point between modules, such as imports, API calls, event flows, route transitions, or service usage.

### Contents
The elements that belong inside a module, such as files, folders, classes, functions, services, routes, stores, models, and tests.

### Dependency
A relationship where one module or code element relies on another.

### Violation
A dependency or placement that breaks intended architectural boundaries or rules.

### Architecture health
A set of signals about the structural quality of the system, such as coupling, instability, circularity, and interface leakage.

## MVP scope
The MVP should focus on a narrow but valuable use case:

**Analyze a TypeScript or JavaScript repository, infer modules from folders and imports, visualize dependencies, and highlight architectural boundary issues.**

### MVP features

#### 1. Repository ingestion
- analyze a local repository or uploaded repository snapshot
- detect project type and framework where possible
- parse relevant source files

#### 2. Code graph generation
- build a file and symbol-level dependency graph
- extract imports, exports, routes, services, models, and selected structural elements

#### 3. Module inference
- infer modules based on folder structure, import patterns, and graph clustering
- allow lightweight manual renaming or regrouping

#### 4. Architecture visualization
- show an interactive graph of modules and dependencies
- support zooming from repository view to module view
- allow filtering by dependency type or module

#### 5. Module detail panel
For each module, show:
- module name
- probable purpose
- contained files and elements
- public surface or entry points
- inbound dependencies
- outbound dependencies
- possible risks

#### 6. Seam inspection
- display the relationships between modules
- classify seam types where possible, such as import-based, route-based, service-based, or event-based

#### 7. Architecture health checks
- circular dependency detection
- deep import detection
- cross-boundary dependency warnings
- unstable or overly coupled module indicators

#### 8. AI summary layer
- summarize what each module does
- explain important module-to-module relationships in plain language

## Out of scope for MVP
- multi-language enterprise-wide coverage
- runtime event tracing
- ownership integration with HR or org systems
- architecture editing as code
- automatic fix generation

## User flow
1. User selects a repository.
2. ArchMap scans and parses the codebase.
3. ArchMap proposes module boundaries.
4. User sees a high-level architecture map.
5. User clicks into a module to inspect contents and dependencies.
6. User reviews seams and architecture warnings.
7. User exports or shares the architecture view.

## Success metrics
- time to first useful architecture map under 10 minutes
- percentage of repositories analyzed successfully
- percentage of inferred modules accepted with little or no editing
- reduction in onboarding time reported by users
- number of architecture issues surfaced per repository
- repeat usage on the same repository over time

## Competitive landscape
Relevant open source tools already exist, including:
- CodeCharta
- Stratify
- DevLens OSS

ArchMap should differentiate through:
- module-first UX
- seam and boundary discovery
- architecture intent versus implementation view
- actionable modularity insight

## Risks and challenges
- architecture inference can be noisy
- large repositories can produce cluttered graphs
- different codebase conventions require flexible heuristics
- language-specific handling can become complex quickly
- AI summaries may be useful but should not be required for core value

## Technical direction

### Suggested frontend
- Next.js
- React
- React Flow or Cytoscape for graph rendering

### Suggested backend
- Node.js with TypeScript
- analysis pipeline for repository parsing and graph construction
- job system for long-running scans if needed

### Suggested parsing tools
- TypeScript compiler API
- ts-morph
- optional graph algorithms for clustering and centrality

## Future opportunities
- support more languages
- architecture diff between commits and pull requests
- saved snapshots and sharing
- configurable architecture rules
- ownership and team overlays
- runtime telemetry overlays
- refactor recommendations
- C4, layered, and domain-driven views

## Initial positioning statement
ArchMap is a living architecture map generated directly from source code, helping teams understand modules, seams, and dependencies in real systems.

## Open questions
- what is the best first granularity: file-level, symbol-level, or module-level?
- should the first release target general Node.js or specifically React/Next.js repos?
- how much manual boundary editing should be included in MVP?
- should AI summaries be part of MVP or follow shortly after?
