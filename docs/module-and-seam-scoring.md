# Module and Seam Scoring Proposal

## Purpose
This document proposes a scoring model for ArchMap to:
- infer likely modules
- surface meaningful seams
- suppress low-value technical noise
- support progressive disclosure in the UI

The goal is not perfect truth. The goal is to produce a useful and explainable architecture view from real code.

## Design principles
- use multiple signals, not one rule
- keep scores explainable
- separate module scoring from seam scoring
- separate architectural meaning from raw graph centrality
- allow thresholds to be tuned per repository type

## Scoring layers
ArchMap should compute several related scores rather than one single magic number.

### 1. Module candidate score
How likely a group of files is to represent a meaningful architectural module.

### 2. Surface visibility score
How likely a file or element should be visible in higher-level views.

### 3. Seam score
How likely a relationship represents a meaningful architectural seam.

### 4. Noise score
How likely a file or element is technical noise for top-level architecture views.

## 1. Module candidate score
A module candidate is a cluster of files or elements that may represent a cohesive architectural unit.

### Suggested inputs

#### Structural boundary signals
- top-level folder boundary
- package or workspace boundary
- project or assembly boundary
- namespace grouping

#### Cohesion signals
- high internal import density
- shared naming vocabulary
- common entry points or related routes
- shared data models or services
- common change tendency in future versions

#### Encapsulation signals
- presence of public export surface
- many internal files with relatively few external touchpoints
- files mostly consumed within the cluster

#### Domain signals
- business-oriented naming
- domain-specific nouns shared by the cluster
- matching route or API prefixes

#### Role diversity signals
- module contains multiple roles such as route, service, model, UI, store
- suggests a cohesive business slice rather than a flat utility group

### Suggested negative inputs
- mostly utility-like names
- shallow group with no clear internal cohesion
- many unrelated technical helpers grouped only by folder
- extremely high outbound coupling with weak internal identity

### Example scoring formula
This is illustrative, not final.

```text
moduleCandidateScore =
  0.25 * structuralBoundaryScore +
  0.25 * cohesionScore +
  0.20 * encapsulationScore +
  0.20 * domainNamingScore +
  0.10 * roleDiversityScore -
  0.20 * utilityNoisePenalty
```

### Score interpretation
- 80 to 100: strong module candidate
- 60 to 79: likely module candidate
- 40 to 59: ambiguous, may require user confirmation
- below 40: weak candidate or technical grouping

## 2. Surface visibility score
This score decides whether a file or element should appear at higher zoom levels.

### Suggested positive inputs
- number of distinct callers
- number of distinct calling modules
- public export status
- framework entry-point status
- role as facade, service, route, adapter, repository, controller, event handler
- downstream reach or blast radius

### Suggested negative inputs
- utility/helper classification
- generated code classification
- test-only usage
- passive constants or types only
- internal-only use by one parent context

### Example scoring formula
```text
surfaceVisibilityScore =
  0.20 * callerCountScore +
  0.25 * crossModuleCallerScore +
  0.20 * publicSurfaceScore +
  0.20 * architecturalRoleScore +
  0.15 * downstreamReachScore -
  0.30 * noiseScore
```

### Score interpretation
- 75+: visible in top-level or module-level views
- 50 to 74: visible in mid-level views
- below 50: collapsed by default

## 3. Seam score
A seam is a meaningful boundary relationship, not just any dependency edge.

### Seam candidates
A seam candidate starts as a relationship between:
- two inferred modules
- a module and an external adapter
- two files that appear to define an interaction boundary

### Suggested positive inputs
- cross-module dependency count
- cross-package dependency count
- existence of public interface or facade
- role type, service seam, event seam, API seam, data seam, adapter seam
- stable directional usage
- repeated interaction through the same boundary path
- multiple callers converging on the same target surface

### Suggested negative inputs
- utility-only dependency
- constants-only dependency
- generated dependency
- test-only relationship
- framework plumbing with little architectural meaning

### Example seam formula
```text
seamScore =
  0.25 * crossBoundaryStrength +
  0.20 * interfaceEvidenceScore +
  0.20 * repeatedInteractionScore +
  0.15 * roleBoundaryScore +
  0.10 * dependencyDirectionSignificance +
  0.10 * callerConvergenceScore -
  0.25 * seamNoisePenalty
```

### Score interpretation
- 80 to 100: strong architectural seam
- 60 to 79: likely seam
- 40 to 59: visible candidate, but ambiguous
- below 40: probably ordinary dependency noise

## 4. Noise score
Noise score helps suppress low-value nodes and edges.

### High-noise indicators
- helper or util naming
- constants or types only
- generated code path
- framework internals
- test-only file
- very low complexity and low architectural role
- passive re-export barrel without independent meaning

### Use of noise score
Noise should not delete nodes. It should affect:
- visibility thresholds
- seam promotion thresholds
- default filtering behavior

## Suggested classifications
ArchMap should classify files and elements where possible.

### Possible architectural roles
- route
- controller
- facade
- service
- domain model
- repository
- adapter
- event producer
- event consumer
- store
- UI component
- util
- constants
- types
- generated
- test

These roles improve both scoring and explanation.

## Explanation model
Scores should be explainable in the UI.

Example:
- surfaced because it is imported by 4 modules
- promoted to seam because it is the public export surface for Checkout
- suppressed because it is shared utility code with no business boundary role

This improves trust and makes manual correction easier.

## Recommended output usage

### Module candidate score is used for
- grouping files into likely modules
- confidence display
- manual review ordering

### Surface visibility score is used for
- zoom behavior
- node expansion defaults
- deciding which files appear in module views

### Seam score is used for
- deciding which boundaries to highlight
- ranking important interactions
- filtering seams panel

### Noise score is used for
- clutter suppression
- demotion of low-value dependencies
- smart defaults in architecture maps

## Recommended MVP thresholds
For an initial prototype:
- module candidate threshold: 60
- top-level visibility threshold: 75
- visibility collapse threshold: 50 (`visibilityCollapseBelow` in analysis metadata; elements with surface visibility score strictly below this are collapsed by default)
- seam promotion threshold: 65
- noise suppression threshold: 60

These should be configurable later.

## Future improvements
- learn weights from user corrections
- tune by framework type
- tune separately for monoliths and monorepos
- incorporate git co-change information
- incorporate ownership metadata

## Conclusion
A scoring approach is better than hard binary rules.

It gives ArchMap a practical way to combine structural, dependency, and architectural signals while keeping the output explainable and tunable.
