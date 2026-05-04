# Caller Heuristic Edge Cases and Counterexamples

## Purpose
This document lists edge cases and counterexamples for the caller-based visibility and seam heuristic.

Its goal is to help test the heuristic before making it a core part of ArchMap.

## Core heuristic under test
- Single-caller files are hidden or collapsed into the caller by default.
- Multi-caller files are surfaced as visible shared elements or seam candidates.

## Why edge cases matter
This heuristic is intuitive, but architecture analysis often fails when simple structural rules are applied too literally.

These examples help clarify where the heuristic works well and where it needs additional qualification.

## Edge case 1: Shared utility file
### Example
`utils/date.ts` is imported by 19 files across the application.

### Risk
The heuristic would surface it strongly because it has many callers.

### Why this is a problem
The file is shared, but it is not an architectural seam in the sense that users care about.
It is a low-level utility, not a module boundary.

### Expected handling
- visible only if user asks to see low-level shared infrastructure
- low seam score
- possibly grouped under shared technical utilities

## Edge case 2: Shared constants or types
### Example
`types/common.ts` or `constants/featureFlags.ts` is imported by many files.

### Risk
It may be misidentified as a major interface.

### Expected handling
- classify as passive shared dependency, not an architectural seam
- suppress or demote in top-level view

## Edge case 3: Important orchestrator with one caller
### Example
`checkout/PlaceOrderWorkflow.ts` is only called by one route handler.

### Risk
The heuristic would hide it because it has one caller.

### Why this is a problem
This file may represent a highly important business workflow and a key internal architectural unit.

### Expected handling
- detect orchestration role
- keep visible or semi-visible despite single caller
- score higher based on role, complexity, or downstream reach

## Edge case 4: Facade behind a single entry point
### Example
`catalog/CatalogFacade.ts` is only called by one web controller, but internally coordinates several subsystems.

### Risk
It gets collapsed even though it is the explicit boundary of the module.

### Expected handling
- preserve visibility because it is a facade or public interface
- detect by export structure, naming, or placement

## Edge case 5: Framework entry points
### Example
A Next.js route file or Express route handler may be referenced implicitly by the framework rather than by imports.

### Risk
Caller count appears low or zero.

### Why this is a problem
These files are often major boundary points.

### Expected handling
- treat framework entry points specially
- include framework-aware extraction

## Edge case 6: Event-driven systems
### Example
A consumer listens to an event rather than being imported directly.

### Risk
Static caller count misses the relationship entirely.

### Expected handling
- augment with event seam detection
- count logical callers, not only import callers

## Edge case 7: Dependency injection and inversion
### Example
A service implementation is resolved through a DI container and referenced through interfaces.

### Risk
The concrete implementation may appear unused or single-used.

### Expected handling
- detect registration and resolution patterns where possible
- avoid over-trusting direct caller count

## Edge case 8: Shared repository or adapter
### Example
`payments/StripeGateway.ts` is called by several modules.

### Risk
This may be surfaced as a seam, which could be correct, but only if the tool understands it is an external boundary adapter rather than a business module.

### Expected handling
- classify as integration seam or infrastructure seam
- distinguish from business-domain seam

## Edge case 9: Generated code
### Example
Generated API clients are imported by many files.

### Risk
They may dominate the graph and appear as central architectural hubs.

### Expected handling
- detect generated code and suppress by default
- optionally group under generated dependencies

## Edge case 10: Index barrel files
### Example
`catalog/index.ts` is imported widely as the public export surface.

### Risk
This is actually a good boundary signal, but it may artificially inflate caller counts for files behind it.

### Expected handling
- recognize barrel files as public surface indicators
- avoid double-counting internal references

## Edge case 11: Monorepo package boundaries
### Example
Multiple files in different packages call a shared library file.

### Risk
This may be a true seam, but the important part is the package boundary, not just the file itself.

### Expected handling
- elevate package and module boundary over raw file centrality
- represent seam at the module or package level where useful

## Edge case 12: Technical layer files
### Example
`repositories/UserRepository.ts` is used by many services.

### Risk
Could be surfaced as an important seam, which may be helpful, but without context users may confuse layer abstractions with business modules.

### Expected handling
- label seam type clearly, for example data seam or repository seam
- distinguish layer role from domain role

## Edge case 13: Cyclic internal cluster
### Example
Five files in one area all call each other heavily, but only one is called externally.

### Risk
Most files disappear while the internal complexity is hidden too aggressively.

### Expected handling
- collapse them as a cluster at high zoom
- expose the cluster on drill-down
- possibly infer an internal submodule

## Edge case 14: Test-only usage
### Example
A helper is only called by tests.

### Risk
Caller count makes it seem visible when it should not matter to production architecture.

### Expected handling
- treat test references separately
- allow filtering test-only relationships out of architecture view

## Edge case 15: Cross-cutting observability code
### Example
A tracing helper or logger is called everywhere.

### Risk
Appears central, but mostly represents instrumentation noise.

### Expected handling
- classify as cross-cutting infrastructure
- suppress from default architecture map

## What these cases suggest
The heuristic becomes much stronger when combined with:
- role detection
- module boundary inference
- framework-aware entry point detection
- cross-boundary analysis
- technical noise suppression
- optional scoring instead of binary display rules

## Recommended test categories for ArchMap
To validate the heuristic, test it against repositories containing:
- business modules with facades
- heavy shared utility usage
- event-driven flows
- DI containers
- monorepos with explicit packages
- framework entry points
- generated client code
- cyclic internal clusters
- cross-cutting logging and observability layers

## Success criteria
The heuristic is successful if:
- top-level views become significantly cleaner
- important module boundaries remain visible
- utility noise is reduced
- shared infrastructure does not masquerade as business architecture
- drill-down reveals hidden detail naturally

## Conclusion
The caller-based heuristic is useful, but only when bounded by architectural context.

These edge cases should be used as design tests for the first implementation of ArchMap’s visibility and seam model.
