# ArchMap TODO

## Immediate
- [ ] review and refine README
- [ ] review PRD and confirm MVP scope
- [ ] review roadmap and adjust phase boundaries
- [ ] confirm first target repository type
- [ ] confirm first target language and framework scope
- [ ] choose initial tech stack

## Product
- [ ] define primary user persona
- [ ] define top 3 user journeys
- [ ] decide what makes a module meaningful in ArchMap
- [ ] define what counts as a seam
- [ ] define architecture health signals for MVP
- [ ] decide whether AI summaries are MVP or post-MVP

## Technical design
- [ ] decide between monorepo and single app structure
- [ ] choose parser approach: ts-morph or TypeScript compiler API
- [ ] define normalized graph schema
- [ ] define module inference heuristics
- [ ] define seam classification heuristics
- [ ] define violation types and severities
- [ ] define persistence format for snapshots

## Prototype
- [ ] create repository scanner spike
- [ ] parse files and extract imports
- [ ] generate file dependency graph JSON
- [ ] implement first module inference prototype
- [ ] create mock module graph data
- [ ] test on at least 2 real repositories

## Frontend MVP
- [ ] choose graph visualization library
- [ ] build basic graph canvas
- [ ] build module detail side panel
- [ ] build filters and search
- [ ] build violations panel
- [ ] test graph readability on medium-sized repos

## Analysis MVP
- [ ] circular dependency detection
- [ ] deep import detection
- [ ] cross-boundary usage detection
- [ ] module dependency aggregation
- [ ] seam evidence collection
- [ ] module summary generation, deterministic or AI

## Documentation
- [ ] create competitor analysis document
- [ ] create architecture decision log
- [ ] create API draft
- [ ] create contribution guide
- [ ] create sample demo script

## Nice to have later
- [ ] commit-to-commit architecture diff
- [ ] pull request architecture review
- [ ] saved snapshots
- [ ] configurable architecture rules
- [ ] multi-language support
- [ ] ownership overlays
- [ ] runtime telemetry overlays
- [ ] refactor suggestions
