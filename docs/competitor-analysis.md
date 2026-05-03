# ArchMap Competitor Analysis

## Purpose
This document summarizes existing open source tools adjacent to ArchMap and identifies likely differentiation opportunities.

## Summary
ArchMap is not entering an empty space. There are already tools for dependency visualization, code metrics, and architecture exploration. However, the space still appears open for a product focused specifically on inferred modules, seams, boundaries, and architectural understanding.

## Key competitors

### 1. CodeCharta
GitHub: `MaibornWolff/codecharta`

#### What it does well
- strong visualization of codebases as 3D maps
- metric overlays and hotspot analysis
- mature open source project
- privacy-friendly local analysis

#### Limits relative to ArchMap
- more metric and structure oriented than module-and-seam oriented
- less focused on inferred architectural boundaries
- may be less intuitive for teams wanting a module-first view

### 2. Stratify
GitHub: `dundalek/stratify`

#### What it does well
- architecture exploration focus
- dependency visualization
- architecture checks and constraints
- multi-language support
- support for multiple output formats

#### Limits relative to ArchMap
- appears more tooling-oriented than product-oriented
- less obviously focused on a polished architecture viewer workflow
- may require more technical setup and interpretation

### 3. DevLens OSS
GitHub: `devlensio/devlensOSS`

#### What it does well
- highly relevant for TypeScript and JavaScript ecosystems
- interactive dependency graph
- node importance scoring
- AI summaries
- commit diff and blast radius concepts
- practical for React, Next.js, and Node.js codebases

#### Limits relative to ArchMap
- likely strongest overlap with ArchMap
- appears more graph and code-node oriented than architecture-boundary oriented
- not clearly centered on module inference, seams, and architectural intent

## Other related projects

### repo-architecture-mcp
GitHub: `vinit-devops/repo-architecture-mcp`
- architecture diagrams and codebase insight
- appears early stage

### CodeToArchitecture
GitHub: `sourabhmadur/CodeToArchitecture`
- explicitly similar concept
- appears small and early

### Codebase_analyzer
GitHub: `Ashank001/Codebase_analyzer`
- static analysis plus architecture visualization
- appears early stage

### CodeFlow
GitHub: `agihub-source/codeflow`
- similar positioning phrase
- appears early and not yet differentiated strongly

## Competitive landscape categories

### Category 1: Dependency graph tools
Strengths:
- clear structural relationships
- often simple and useful quickly

Weaknesses:
- usually too low-level
- can become hairballs on real codebases
- not enough architecture meaning

### Category 2: Metrics visualization tools
Strengths:
- good for hotspots, complexity, and maintainability signals

Weaknesses:
- often weak on architectural understanding
- may not explain business or module boundaries

### Category 3: Architecture rule tools
Strengths:
- useful for enforcing constraints
- strong for governance and refactoring

Weaknesses:
- often less visual
- can be hard to adopt before teams understand the current architecture

### Category 4: AI code explorers
Strengths:
- useful for summarization and navigation
- can reduce onboarding effort

Weaknesses:
- may summarize structure without modeling architecture deeply
- can be impressive without being reliably actionable

## Likely differentiation for ArchMap
ArchMap should focus on the following wedge:

### 1. Module-first experience
Instead of starting with files or symbols, start with inferred architectural modules.

### 2. Seam discovery
Explain how modules interact and where the boundaries actually are.

### 3. Intended versus actual architecture
Allow users to compare what the system seems to be with what they want it to become.

### 4. Containment clarity
Show what each module contains in a way that is easy to inspect and reason about.

### 5. Architecture health in context
Don’t just list cycles or deep imports. Explain which boundary they affect and why it matters.

## Suggested positioning statement
ArchMap helps teams discover the real modules, seams, and boundaries inside a codebase, turning source code into a living architecture map.

## Strategic implications
If ArchMap is built, it should avoid being perceived as only:
- another dependency graph tool
- another AI code summarizer
- another metric dashboard

Instead it should present itself as:
- architecture inference and visualization
- module and seam discovery
- boundary health and modularity insight
- architecture understanding for real, existing codebases

## Recommendation
For MVP messaging and design, optimize around these questions:
- what are the main modules?
- what are the seams between them?
- what belongs inside each module?
- where are the architecture violations?
- what should be refactored first?
