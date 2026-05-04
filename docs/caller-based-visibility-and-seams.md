# Caller-Based Visibility and Seam Heuristic

## Purpose
This document formalizes a proposed ArchMap heuristic based on caller count and shared usage.

The idea is strong, but it should be applied primarily to:
- visualization abstraction
- progressive disclosure
- seam surfacing

It should not be used as the sole mechanism for module identification.

## Origin of the proposal
Initial proposal:
1. Any file that is referred to by a single file should be hidden from the high-level UI, enclosed in the caller, and only shown when zooming in.
2. If a file is called by two or more files, it should appear in the UI and the call method should appear as a seam or interface.

## Architectural assessment
This proposal is useful because it captures an important distinction between:
- internal implementation detail
- shared visible surface

That makes it a strong basis for graph decluttering and progressive disclosure.

However, a file being shared does not automatically make it a module, and it does not always make it an architectural seam. For that reason, the heuristic should be treated as a visibility and boundary signal rather than a full module identification algorithm.

## Core concepts

### Internal implementation detail
A file or element primarily used by a single parent context and not intended as a shared boundary.

### Shared surface candidate
A file or element used by multiple distinct callers and therefore a candidate for visibility at higher zoom levels.

### Seam
A meaningful interaction surface across architectural boundaries, such as modules, layers, packages, or services.

### Module
A cohesive architectural unit inferred using multiple signals, not caller count alone.

## Recommended interpretation

### Rule 1: Internal compression
If a file has exactly one meaningful caller and is not an entry point or explicit boundary element, it should be collapsed into its caller by default in higher-level views.

#### Why
- reduces graph noise
- supports a deeper, cleaner architectural view
- distinguishes implementation detail from shared structure

#### Important note
The file should still exist in the underlying model. It is hidden by default in the UI, not erased from analysis.

### Rule 2: Shared surface candidate
If a file has two or more distinct callers, it should be marked as a shared surface candidate.

#### Why
- shared usage often indicates an exposed surface
- these files are more likely to matter in architecture exploration
- they often represent reusable utilities, adapters, or facades

### Rule 3: Seam qualification
A shared surface candidate should be promoted to a visible seam only if it has cross-boundary significance.

Examples of qualifying conditions:
- callers belong to different inferred modules
- callers belong to different packages or top-level folders
- the target is part of a public export surface
- the target acts as a service, adapter, repository, controller, route, or event handler
- the interaction crosses a layer or domain boundary

### Rule 4: Module inference remains separate
Modules should be inferred using additional signals such as:
- package and folder boundaries
- dependency graph clustering
- public entry points
- naming and domain cohesion
- framework-specific structure

The caller-based heuristic should then be used to control how those modules and their internals are shown.

## Design intent
This heuristic is best understood as a way to produce a cleaner and more useful architecture map.

It helps ArchMap answer:
- what should be visible at the current zoom level?
- what is likely internal detail?
- what is likely a reusable or exposed surface?
- where are shared boundaries worth highlighting?

It is less suitable for answering:
- what is a module?
- what is the correct business boundary?
- what should the target architecture be?

## Why this is useful for ArchMap
ArchMap needs to avoid overwhelming users with file-level noise.

A purely literal graph of files and imports becomes unreadable quickly. This heuristic helps by:
- collapsing low-value details
- emphasizing shared and cross-boundary elements
- making the visualization feel architectural instead of merely syntactic
- supporting layered zoom experiences

## Recommended UI behavior

### High-level architecture view
- hide single-caller internal files by default
- show inferred modules
- show shared surface candidates that qualify as seams
- emphasize cross-module interaction paths

### Mid-level module view
- reveal important internal sub-areas
- show shared internal services and entry points
- distinguish public surface from private implementation

### Deep zoom view
- reveal compressed internal files
- show the detailed file and call graph
- allow users to inspect why a file was hidden or surfaced

## Scoring suggestions
The heuristic may work better as a score rather than a binary rule.

Example visibility score inputs:
- number of distinct callers
- number of calling modules
- whether the file is publicly exported
- whether the file is an entry point
- whether the file matches an architectural role pattern
- whether the file is a known low-value utility type

Example seam score inputs:
- cross-module usage count
- cross-package usage count
- boundary type, service, route, event, adapter, repository
- dependency direction significance
- centrality in the interaction graph

## Recommended exceptions
These files may deserve visibility even with a single caller:
- routes
- controllers
- public API exports
- event consumers and producers
- workflow orchestrators
- domain services
- repositories
- adapters to external systems

These files may deserve suppression even with many callers:
- constants
- primitive utility helpers
- shared type definition files
- generic logging wrappers
- generated code
- framework glue with little architectural meaning

## Risks if used incorrectly
If used as the sole module identification strategy, this heuristic can create false conclusions.

Common failure modes:
- shared utility files appearing as architectural seams
- important but narrowly-used modules disappearing from the top-level view
- orchestration logic being hidden because it has one caller
- low-level technical artifacts being mistaken for business boundaries

## Recommended formal wording for the spec
A good specification version is:

1. Files referenced by only one parent context are treated as internal implementation details and are collapsed by default in higher-level views.
2. Files referenced by multiple distinct callers are treated as shared surface candidates.
3. Shared surface candidates are promoted to visible seams only when they support cross-boundary interactions between inferred modules, layers, packages, or services.
4. Modules are inferred separately using structural, dependency, and cohesion signals.

## Conclusion
This is a strong heuristic for visualization and seam surfacing.

It should become one of the core interaction and rendering ideas in ArchMap, but it should be complemented by broader module inference logic.

Used that way, it can become a meaningful part of ArchMap’s differentiation and UI clarity.
