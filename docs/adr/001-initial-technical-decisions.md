# ADR 001: Initial Technical Decisions

## Status
Proposed

## Context
ArchMap is in the planning and prototyping stage. We need a small set of initial technical decisions so the first implementation can move forward without overcommitting too early.

The product goal is to analyze an existing codebase and generate an explorable architecture map focused on modules, seams, contents, and architecture health.

## Decision 1: Focus on TypeScript and JavaScript first
### Decision
The first implementation will target TypeScript and JavaScript repositories.

### Rationale
- large ecosystem and many potential users
- strong parser support
- fast path to a useful MVP
- aligns with comparable tools like DevLens

### Consequences
- architecture model should remain language-agnostic where possible
- later language support should be added via adapters or extractors

## Decision 2: Prefer deterministic analysis before AI assistance
### Decision
The core architecture model should be built from deterministic static analysis first. AI should enhance summaries and explanations, not replace structural extraction.

### Rationale
- more reliable and explainable
- easier to test
- keeps core value independent of LLM availability
- reduces risk of hallucinated architecture

### Consequences
- module inference should rely on heuristics and graph analysis first
- AI summaries should be optional and secondary

## Decision 3: Start with local-first analysis
### Decision
The first version should analyze repositories locally rather than requiring code upload to a hosted backend.

### Rationale
- source code is sensitive
- simpler trust story
- fewer privacy concerns
- easier to test with local repositories during prototyping

### Consequences
- onboarding may initially be more technical
- a future hosted mode can be added later if needed

## Decision 4: Visualize modules first, not files first
### Decision
The default UX should begin at module level rather than file level.

### Rationale
- file-level graphs become noisy quickly
- the product's differentiation is architecture understanding
- module abstraction is more useful for leads and architects

### Consequences
- module inference quality is critical
- file and symbol-level detail should appear progressively on drill-down

## Decision 5: Use a normalized graph model as the system backbone
### Decision
All analysis results should be transformed into a normalized graph model with entities such as Module, Element, Dependency, Seam, Violation, and Snapshot.

### Rationale
- flexible foundation for frontend views
- supports future diffing and rule evaluation
- keeps parser-specific logic separate from product concepts

### Consequences
- requires careful schema design early
- parser output should not be exposed directly to the UI

## Decision 6: Use simple persistence early
### Decision
Use JSON artifacts or a lightweight database for the first implementation.

### Rationale
- fast to prototype
- low operational overhead
- enough for local analysis and early demos

### Consequences
- migration path to stronger persistence should be planned later
- snapshot schema stability will matter early

## Decision 7: Keep the first rule set small and useful
### Decision
The initial rule engine should focus on a few high-value checks:
- circular dependencies
- deep imports
- cross-boundary dependencies
- high coupling indicators

### Rationale
- keeps MVP focused
- easier to explain to users
- avoids overwhelming the UI with noise

### Consequences
- some architectural concerns will remain unsupported in MVP
- rule severity and evidence design should be considered carefully

## Decision 8: Build around an interactive web UI
### Decision
The main user experience should be delivered through a web-based interface.

### Rationale
- good fit for graph exploration
- easiest to share internally later
- works well with side panels, filters, and drill-down navigation

### Consequences
- analysis pipeline and UI should be loosely coupled
- a CLI may still be useful as an internal or secondary interface

## Open questions
- should the first release support only local paths, or also zipped repository uploads?
- should route and framework-aware analysis be part of the first prototype?
- should the project be structured as a monorepo immediately, or start simpler and evolve?

## Next review point
Review these decisions after the first working analysis spike and first graph UI prototype.
