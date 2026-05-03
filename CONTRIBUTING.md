# Contributing to ArchMap

Thanks for your interest in ArchMap.

ArchMap is currently in the planning and prototyping stage. Contributions are welcome, but the project is still shaping its architecture and scope, so some areas may change quickly.

## Ways to contribute
You can help by:
- improving documentation
- proposing product ideas or UX improvements
- contributing analysis prototypes
- improving graph visualization
- testing against real repositories
- reporting issues and edge cases

## Before you start
Please read:
- `README.md`
- `PRD.md`
- `ROADMAP.md`
- `ARCHITECTURE.md`
- `docs/adr/001-initial-technical-decisions.md`

These documents describe the current direction of the project.

## Contribution principles
- keep the product focused on architecture understanding
- prefer deterministic analysis for core structure
- keep AI features optional and additive
- optimize for clarity over cleverness
- avoid adding complexity before it is needed

## Suggested workflow
1. Open an issue or discussion for substantial ideas.
2. Align on approach before large changes.
3. Keep pull requests focused and small where possible.
4. Update docs when behavior or direction changes.

## Areas that are especially useful right now
- TypeScript and JavaScript parser experiments
- module inference heuristics
- seam detection ideas
- graph schema design
- UI exploration for module-first visualization
- competitor and market research

## Code style
This will be defined more formally once the implementation starts.

For now:
- prefer TypeScript
- keep modules small and focused
- write clear names and comments where needed
- avoid premature abstraction

## Architecture changes
If your contribution changes major architecture direction, please add or update an ADR under `docs/adr/`.

## Documentation changes
Documentation is part of the product. If you clarify direction, terminology, or decisions, please update the relevant docs in the same change.

## Reporting issues
When reporting issues, include:
- what you expected
- what happened instead
- sample repository characteristics if relevant
- screenshots or graph output if relevant

## Project status note
Because the project is early, maintainers may prioritize product direction and architectural coherence over broad feature acceptance.

Thanks for helping shape ArchMap.
