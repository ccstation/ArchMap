# ArchMap

> Visualize your codebase architecture from source code.

ArchMap helps developers understand an existing codebase by turning it into a living architecture map. Instead of relying on stale diagrams or tribal knowledge, ArchMap analyzes source code and shows how an application is structured.

It is designed to help teams explore:
- modules
- seams and boundaries
- dependencies between parts of the system
- what each module contains
- architectural risks and violations

## Why ArchMap

As codebases grow, architecture becomes harder to see.

Common problems:
- architecture lives in people's heads
- diagrams become outdated quickly
- onboarding takes too long
- module boundaries get blurry
- refactoring becomes risky without a shared map

ArchMap aims to make architecture visible directly from the repository.

## Vision

ArchMap turns source code into an explorable architecture view so teams can understand, discuss, and improve software structure with confidence.

## Core ideas

### Modules
Logical areas of the system, grouped by responsibility, ownership, or behavior.

### Seams
The boundaries and interaction points between modules, such as imports, service calls, events, routes, or APIs.

### Contents
The files, classes, functions, services, routes, models, and other elements that belong inside each module.

### Architecture health
Signals that help teams assess structural quality, such as coupling, circular dependencies, deep imports, and boundary violations.

## What ArchMap should do

ArchMap should allow users to:
- scan an existing repository
- infer modules from the codebase structure and dependencies
- visualize seams and dependencies between modules
- inspect what each module contains
- identify architectural hotspots and violations
- keep architecture views current as the code changes

## Proposed MVP

The first version should focus on a strong narrow use case:

**Analyze a TypeScript or JavaScript repository, infer modules from folders and imports, visualize dependencies, and highlight boundary issues.**

### MVP features
- repository ingestion
- file tree and import graph analysis
- module inference
- interactive architecture graph
- module detail view
- seam and dependency inspection
- circular dependency detection
- deep import and boundary violation checks
- lightweight AI summaries for modules

## Target users

- engineering leads
- architects
- staff and principal engineers
- developers onboarding into a new codebase
- teams planning refactors
- consultants performing architecture reviews

## Differentiation

Existing tools often focus on one of these:
- dependency graphs
- code metrics
- framework-specific exploration
- static documentation

ArchMap should differentiate by focusing on:
- module-first architecture visualization
- seam and boundary discovery
- architecture intent versus actual structure
- actionable insight for refactoring and modularization

## Potential future features

- support for more languages
- saved architecture snapshots
- architecture diffs across commits or pull requests
- rule engine for architectural constraints
- ownership mapping
- runtime telemetry overlays
- suggested refactor opportunities
- C4-style and layered views

## Suggested positioning

**ArchMap is a living architecture map generated from real code.**

## Status

An MVP implementation is available in this repository: a **local-first** analyzer for TypeScript/JavaScript, a **Next.js** UI with an interactive module graph, REST APIs aligned with [API.md](API.md), and **optional OpenAI** summaries when `OPENAI_API_KEY` is set.

## Documentation (`docs/`)

| File | Purpose |
| --- | --- |
| [docs/detection-and-scoring-rules.md](docs/detection-and-scoring-rules.md) | **Canonical** detection pipeline order, score definitions and weights, MVP thresholds, and how other docs relate when they disagree. |
| [docs/detection-flow-pseudocode.md](docs/detection-flow-pseudocode.md) | End-to-end analysis pseudocode (load repo → graph → modules → visibility → seams → violations); defers numeric weights to the rules doc above. |
| [docs/module-and-seam-scoring.md](docs/module-and-seam-scoring.md) | Scoring model design: inputs, example formulas, score bands, and rationale for module, surface visibility, seam, and noise scores. |
| [docs/inferred-module-and-seam-schema.md](docs/inferred-module-and-seam-schema.md) | JSON-oriented **analysis output** shapes: repository, snapshot, modules, elements, dependencies, seams, violations, `analysisMeta`. |
| [docs/analysis-presentation-json-schema.md](docs/analysis-presentation-json-schema.md) | JSON contract between **analysis** and **presentation** stages (nodes, edges, groups, views) plus aligned metadata thresholds. |
| [docs/caller-based-visibility-and-seams.md](docs/caller-based-visibility-and-seams.md) | Caller-based heuristics for **UI collapse** and seam qualification; clarifies they are not the primary module-inference signal. |
| [docs/caller-heuristic-edge-cases.md](docs/caller-heuristic-edge-cases.md) | Edge cases and pitfalls when applying caller counts to visibility and seams. |
| [docs/module-identification.md](docs/module-identification.md) | Research note: industry concepts (DDD, packages, dependency graphs, ownership) that inform how ArchMap frames **module inference**. |
| [docs/competitor-analysis.md](docs/competitor-analysis.md) | Landscape of related tools and how ArchMap compares. |
| [docs/adr/001-initial-technical-decisions.md](docs/adr/001-initial-technical-decisions.md) | Architecture decision record for early technical choices. |

## Development

Requirements: **Node.js 20+**, **pnpm 9+**.

### Web UI

**Analyze a repo and open the UI from the CLI** (bundled standalone app; rebuilds `archview` first, then serves on an available port—defaults to `http://127.0.0.1:3000`):

```bash
pnpm archview -- --src ./fixtures/mini-repo --no-open
```

- **`--src`** — repository root to analyze (absolute or relative path).
- **`--no-open`** — do not launch the system browser; open the printed URL yourself. Omit it to auto-open when running in a TTY.

Point at any other checkout:

```bash
pnpm archview -- --src /absolute/path/to/repo --no-open
```

**Next.js dev UI** (manual path entry in the app, hot reload while hacking on `apps/web`):

```bash
pnpm install
pnpm dev
```

Then open **[http://localhost:3000](http://localhost:3000)** (Next.js default). Enter an **absolute path** to a repository on disk and choose **Analyze**. Results stay in memory for that server process.

To run the **built** main web app locally after `pnpm build` (without `archview`):

```bash
pnpm --filter @archmap/web start
```

Same URL unless you set `PORT`.

### Analyze from the command line

From the **ArchMap repo root**, build the analyzer once, then point it at any TypeScript/JavaScript repository:

```bash
pnpm build
pnpm analyze /absolute/path/to/your/repo --out archmap-snapshot.json
```

Optional display name for the snapshot:

```bash
pnpm analyze /absolute/path/to/your/repo --out archmap-snapshot.json --name "My service"
```

- **`pnpm analyze`** runs `packages/analyzer`’s CLI (`archmap-analyze` in that package). **`pnpm snapshot`** is the same command if you prefer that name.
- **`--out` / `-o`** writes the full analysis JSON (modules, elements, dependencies, seams, violations, `analysisMeta`). Omit `--out` to only print snapshot metadata and module counts to the terminal.
- Paths can be **absolute or relative** to your current working directory.

After a workspace build, you can call the same entrypoint with Node (handy for `--help`):

```bash
node ./packages/analyzer/dist/cli.js --help
node ./packages/analyzer/dist/cli.js /path/to/repo -o snapshot.json
```

From `packages/analyzer`, `pnpm run cli -- --help` runs the same binary.

### Optional AI summaries

Set `OPENAI_API_KEY` in the environment when running `pnpm dev`. The UI shows **Generate AI summaries** when the key is present. Summaries use **paths and dependency stats only**, not full file contents.

Optional: `OPENAI_MODEL` (defaults to `gpt-4o-mini`).

### Layout

- `packages/graph-model` — Zod schemas and shared types
- `packages/analyzer` — ingestion, ts-morph import graph, module inference, rules
- `apps/web` — Next.js App Router, `/api/*` routes, React Flow UI
- `fixtures/mini-repo` — tiny sample repo used in tests

### Commands

| Command | Description |
|--------|-------------|
| `pnpm archview -- --src <path> [--no-open]` | **Web UI** — analyze repo, serve bundled UI (example: `pnpm archview -- --src ./fixtures/mini-repo --no-open`) |
| `pnpm dev` | **Web UI** — Next.js dev server ([http://localhost:3000](http://localhost:3000)) |
| `pnpm --filter @archmap/web start` | **Web UI** — production server (run after `pnpm build`) |
| `pnpm build` | Build all workspace packages |
| `pnpm analyze <repo> [--out file] [--name label]` | Run CLI analysis on a local repo (`pnpm snapshot` is an alias) |
| `pnpm test` | Vitest in graph-model + analyzer |
| `pnpm typecheck` | Typecheck (when configured per package) |

### Known limitations (MVP)

- Module inference is **folder-first** under `src/` (or top-level folders when no `src/`).
- Import resolution follows **ts-morph** and your `tsconfig`; path aliases may be incomplete in edge cases.
- Analysis results in the web UI are **in-memory** and reset when the server restarts.
- Large repositories may need longer scan times; there is no background job queue yet.

## Working repo description

Visualize your codebase architecture from source code.
