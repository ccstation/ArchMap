# ArchMap Roadmap

## Overview
This roadmap outlines a practical path for building ArchMap from concept to a usable MVP and beyond.

## Phase 0: Product framing
Goal: sharpen the product definition and reduce ambiguity before building.

### Deliverables
- finalized project name and positioning
- README
- PRD
- roadmap
- target user definition
- MVP scope agreement
- initial competitor and differentiation summary

### Exit criteria
- clear problem statement
- clear MVP boundaries
- shared understanding of target users and use cases

---

## Phase 1: Technical spike and architecture foundation
Goal: prove that the core analysis and visualization pipeline is feasible.

### Key questions
- how should repositories be ingested?
- what level of analysis is realistic for the first release?
- what graph model should represent modules, seams, and contents?
- how should inferred modules be derived?

### Deliverables
- repository scanner prototype
- TypeScript and JavaScript parser spike
- import dependency graph prototype
- initial module inference heuristics
- sample output JSON schema for graph data
- technology choices for frontend and backend

### Suggested tasks
- set up monorepo or project structure
- evaluate ts-morph versus direct TypeScript compiler API
- define entities such as Module, Element, Dependency, Seam, Violation
- create a CLI or script that scans a sample repo and emits graph JSON
- test on at least 2 to 3 real repositories

### Exit criteria
- can scan a TS or JS repo successfully
- can extract imports and build a dependency graph
- can produce a usable intermediate architecture model

---

## Phase 2: MVP analysis engine
Goal: build the backend logic that powers the first useful version.

### Deliverables
- repository ingestion flow
- file graph and dependency graph builder
- module inference engine
- seam classification logic
- architecture rule checks
- persistence format for analysis results

### MVP capabilities
- detect files and folders
- extract imports and exports
- detect route or entry-point patterns where possible
- cluster files into inferred modules
- identify inbound and outbound dependencies
- detect circular dependencies
- detect deep imports and cross-boundary usage

### Suggested tasks
- build graph construction pipeline
- implement graph clustering heuristics
- create rule engine for boundary checks
- define module scoring and health signals
- create example datasets for testing

### Exit criteria
- analysis output is stable on sample repos
- inferred modules are understandable enough to demo
- violations are useful and not overwhelmingly noisy

---

## Phase 3: MVP frontend and user experience
Goal: make the architecture understandable and explorable in a product UI.

### Deliverables
- repository analysis results viewer
- interactive architecture graph
- module detail panel
- seam inspection panel
- search and filtering
- architecture health warnings panel

### MVP UX features
- graph of modules and dependencies
- zoom and pan
- click to inspect module details
- filter by dependency type or severity
- highlight cycles and suspicious boundaries
- browse files contained within a module

### Suggested tasks
- choose graph library, likely React Flow or Cytoscape
- design graph layout strategy
- build module summary cards and side panels
- add search, filters, and legends
- test usability on small and medium repos

### Exit criteria
- users can navigate architecture without confusion
- module relationships are visually understandable
- the interface works for real repositories, not just toy examples

---

## Phase 4: MVP intelligence layer
Goal: improve usability with explanation and summarization.

### Deliverables
- AI-generated module summaries
- AI-generated relationship summaries
- explanation of rule violations in plain language
- lightweight naming suggestions for inferred modules

### Suggested tasks
- define prompts for module summarization
- generate summaries using topological or dependency-aware order
- cache summary outputs
- allow summaries to be optional so the product still works without them

### Exit criteria
- summaries improve comprehension without becoming misleading
- core product remains useful even without AI features

---

## Phase 5: MVP packaging and launch readiness
Goal: prepare ArchMap for first external usage.

### Deliverables
- installation or onboarding flow
- sample repositories for demos
- documentation
- known limitations list
- issue templates and contribution guidance if open source

### Suggested tasks
- polish README and docs
- define local-first or hosted-first setup
- create demo walkthrough
- gather feedback from first testers

### Exit criteria
- at least a few users can analyze a repo and get value without direct guidance
- major failure cases are documented
- product story is clear

---

## Post-MVP roadmap

### Phase 6: Collaboration and history
- saved snapshots
- compare architecture across commits
- pull request architecture diffs
- shareable links and reports
- comments and annotations

### Phase 7: Rules and governance
- user-defined architecture rules
- dependency direction enforcement
- layer definitions
- domain boundary rules
- CI integration for architecture regressions

### Phase 8: Broader ecosystem support
- support more languages
- support monorepos better
- framework-specific plugins
- infrastructure and service topology overlays

### Phase 9: Advanced insight
- ownership overlays
- runtime telemetry overlays
- impact analysis
- suggested refactor opportunities
- deeper modularity scoring

---

## Recommended build order
If building with limited time, I recommend this exact sequence:

1. repository scanner
2. import graph builder
3. module inference prototype
4. graph JSON schema
5. interactive module graph UI
6. module detail panel
7. circular dependency and deep import rules
8. seam classification
9. AI summaries
10. snapshots and diffing

---

## Suggested first milestone
### Milestone 1: First useful demo
A user can point ArchMap at a TypeScript repository and get:
- inferred modules
- dependency graph between modules
- a module detail view
- circular dependency warnings
- deep import warnings

This should be the first goal because it proves the core value of the product.

## Suggested second milestone
### Milestone 2: Architecture understanding demo
A user can inspect seams, read module summaries, and understand the structure of a medium-sized repository within minutes.

## Suggested third milestone
### Milestone 3: Team workflow demo
A team can compare architecture changes over time and use ArchMap during refactoring discussions.

---

## Recommended tech stack
### Frontend
- Next.js
- React
- TypeScript
- React Flow or Cytoscape
- Tailwind CSS if fast UI iteration is desired

### Backend
- Node.js
- TypeScript
- ts-morph or TypeScript compiler API
- optional worker queue for longer analysis jobs

### Data model
Core entities:
- Repository
- Module
- Element
- Dependency
- Seam
- Violation
- Snapshot

---

## Risks to manage early
- graph clutter for large repos
- poor module inference quality
- over-reliance on framework-specific assumptions
- expensive or slow analysis for large codebases
- AI summaries masking weak structural analysis

---

## Immediate next steps
1. decide first target repository type
2. choose initial parsing approach
3. define graph schema
4. create analysis spike
5. test on real repositories
6. draft system architecture document
