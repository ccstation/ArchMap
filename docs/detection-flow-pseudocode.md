# Detection Flow Pseudocode

## Purpose
This document sketches a prototype detection flow for ArchMap.

**Canonical weights and thresholds:** `detection-and-scoring-rules.md` supersedes the numeric coefficients in the pseudocode below if they differ (notably `computeSurfaceVisibilityScore`).

It combines:
- structural discovery
- dependency extraction
- module inference
- caller-based visibility heuristics
- seam promotion
- violation detection

The purpose is to guide implementation, not to lock in exact code structure.

## High-level flow

```text
1. load repository
2. detect project structure and framework
3. collect relevant source files
4. extract elements and dependencies
5. classify architectural roles
6. infer module candidates
7. compute scores
8. collapse low-visibility internals
9. promote meaningful seams
10. detect violations
11. emit normalized analysis output
```

## Pseudocode

```pseudo
function analyzeRepository(repoPath):
    thresholds = defaultAnalysisThresholds()  // same keys as analysisMeta.thresholds; see detection-and-scoring-rules.md

    repository = loadRepositoryMetadata(repoPath)
    frameworkInfo = detectFrameworks(repoPath)
    sourceFiles = collectSourceFiles(repoPath, frameworkInfo)

    elements = []
    dependencies = []

    for each file in sourceFiles:
        parsed = parseFile(file)
        element = createElementFromFile(parsed)
        element.role = classifyRole(parsed, frameworkInfo)
        element.flags = detectFlags(parsed, file, frameworkInfo)
        elements.add(element)

        fileDependencies = extractDependencies(parsed, frameworkInfo)
        dependencies.addAll(fileDependencies)

    dependencyGraph = buildDependencyGraph(elements, dependencies)

    enrichWithFrameworkEntryPoints(elements, dependencies, frameworkInfo)
    enrichWithPublicExportSurfaces(elements, dependencies)
    enrichWithEventRelationships(elements, dependencies, frameworkInfo)

    clusters = inferInitialClusters(elements, dependencyGraph)
    moduleCandidates = []

    for each cluster in clusters:
        candidate = buildModuleCandidate(cluster)
        candidate.score = scoreModuleCandidate(candidate, dependencyGraph)
        candidate.evidence = collectModuleEvidence(candidate, dependencyGraph)
        moduleCandidates.add(candidate)

    modules = promoteModuleCandidates(moduleCandidates, threshold = thresholds.moduleCandidate)
    assignElementsToModules(elements, modules, dependencyGraph)

    for each element in elements:
        element.metrics = computeElementMetrics(element, dependencyGraph, modules)
        element.noiseScore = computeNoiseScore(element)
        element.visibilityScore = computeSurfaceVisibilityScore(element, modules)
        element.collapsedByDefault = element.visibilityScore < thresholds.visibilityCollapseBelow

    seamCandidates = groupCrossBoundaryDependencies(dependencies, modules)
    seams = []

    for each candidate in seamCandidates:
        candidate.score = computeSeamScore(candidate, modules, elements)
        candidate.evidence = collectSeamEvidence(candidate)

        if candidate.score >= thresholds.seamPromotion:
            seams.add(promoteSeam(candidate))

    violations = []
    violations.addAll(detectCircularDependencies(modules, dependencyGraph))
    violations.addAll(detectDeepImports(modules, dependencies, elements))
    violations.addAll(detectCrossBoundaryLeaks(modules, dependencies, elements))
    violations.addAll(detectHighCouplingModules(modules, dependencyGraph))

    snapshot = buildSnapshot(repository)

    return buildAnalysisDocument(
        repository,
        snapshot,
        modules,
        elements,
        dependencies,
        seams,
        violations
    )
```

## Detailed functions

### classifyRole
Classifies a file or element into one or more architectural roles.

```pseudo
function classifyRole(parsed, frameworkInfo):
    if isFrameworkRoute(parsed, frameworkInfo): return "route"
    if isController(parsed): return "controller"
    if isFacade(parsed): return "facade"
    if isRepository(parsed): return "repository"
    if isAdapter(parsed): return "adapter"
    if isEventConsumer(parsed): return "event-consumer"
    if isEventProducer(parsed): return "event-producer"
    if isStore(parsed): return "store"
    if isUIComponent(parsed): return "ui-component"
    if isUtility(parsed): return "util"
    if isConstantsFile(parsed): return "constants"
    if isTypesFile(parsed): return "types"
    return "unknown"
```

### inferInitialClusters
Combines structural and graph signals.

```pseudo
function inferInitialClusters(elements, dependencyGraph):
    structuralGroups = groupByTopLevelFolderOrPackage(elements)
    graphCommunities = detectDependencyCommunities(dependencyGraph)
    return reconcileStructuralAndGraphGroups(structuralGroups, graphCommunities)
```

### computeSurfaceVisibilityScore
Applies the caller-based visibility idea safely. Framework entry points are **not** a separate weighted term: `scoreArchitecturalRole` (and public surface where applicable) should elevate routes and similar entry files. See `detection-and-scoring-rules.md`.

```pseudo
function computeSurfaceVisibilityScore(element, modules):
    callerCountScore = normalizeDistinctCallers(element.metrics.distinctCallerCount)
    crossModuleCallerScore = normalizeDistinctCallingModules(element.metrics.distinctCallingModuleCount)
    publicSurfaceScore = element.flags.isPublicExport ? 100 : 0
    roleScore = scoreArchitecturalRole(element.role)
    downstreamReachScore = normalizeDownstreamReach(element.metrics.downstreamReach)
    noisePenalty = element.noiseScore

    return weightedSum(
        0.20 * callerCountScore,
        0.25 * crossModuleCallerScore,
        0.20 * publicSurfaceScore,
        0.20 * roleScore,
        0.15 * downstreamReachScore,
       -0.30 * noisePenalty
    )
```

### computeSeamScore
Promotes only meaningful cross-boundary interactions.

```pseudo
function computeSeamScore(candidate, modules, elements):
    crossBoundaryStrength = scoreCrossBoundaryStrength(candidate)
    interfaceEvidence = scoreInterfaceEvidence(candidate, elements)
    repeatedInteraction = scoreRepeatedInteraction(candidate)
    roleBoundaryScore = scoreBoundaryRoles(candidate, elements)
    directionScore = scoreDependencyDirection(candidate)
    convergenceScore = scoreCallerConvergence(candidate)
    noisePenalty = scoreSeamNoise(candidate, elements)

    return weightedSum(
        0.25 * crossBoundaryStrength,
        0.20 * interfaceEvidence,
        0.20 * repeatedInteraction,
        0.15 * roleBoundaryScore,
        0.10 * directionScore,
        0.10 * convergenceScore,
       -0.25 * noisePenalty
    )
```

## Key implementation notes

### 1. Single-caller collapse is a UI default, not a deletion rule
Even if an element is collapsed by default, it should remain in the internal graph.

### 2. Multi-caller does not automatically imply seam
A shared utility file must not be promoted just because many files import it.

### 3. Module inference and seam inference are separate
Modules are inferred first.
Seams are then identified based on cross-boundary interactions.

### 4. Explanation is part of the system
Each promoted module or seam should carry evidence explaining why it was surfaced.

## Recommended MVP simplifications
For MVP, simplify by:
- analyzing files instead of symbols first
- focusing on import relationships first
- supporting TypeScript and JavaScript only
- using folder plus dependency clustering for module candidates
- using a small set of roles, route, facade, service, util, adapter, store, generated, test

## Future enhancements
- symbol-level analysis
- event and runtime seam extraction
- git co-change signals
- ownership signals
- learned threshold tuning from user corrections

## Conclusion
This flow gives ArchMap a realistic path from source code to inferred modules, visible surfaces, seams, and violations while keeping the system understandable and incrementally buildable.
