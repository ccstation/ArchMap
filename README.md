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

## Development

Requirements: **Node.js 20+**, **pnpm 9+**.

```bash
pnpm install
pnpm dev
```

Open the web app (defaults to `http://localhost:3000`). Enter an **absolute path** to a repository on disk and run **Analyze**. Results stay in memory on the server process (typical for local development).

### CLI snapshot

From the repo root (after `pnpm build`):

```bash
pnpm snapshot /absolute/path/to/repo --out snapshot.json
```

This runs `packages/analyzer`’s CLI (`archmap-analyze`), which writes a JSON snapshot. Requires `pnpm build` first so `packages/analyzer/dist/cli.js` exists.

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
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Build all workspace packages |
| `pnpm test` | Vitest in graph-model + analyzer |
| `pnpm typecheck` | Typecheck (when configured per package) |

### Known limitations (MVP)

- Module inference is **folder-first** under `src/` (or top-level folders when no `src/`).
- Import resolution follows **ts-morph** and your `tsconfig`; path aliases may be incomplete in edge cases.
- Analysis results in the web UI are **in-memory** and reset when the server restarts.
- Large repositories may need longer scan times; there is no background job queue yet.

## Working repo description

Visualize your codebase architecture from source code.
