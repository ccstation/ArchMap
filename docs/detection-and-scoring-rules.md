# ArchMap detection and scoring rules (canonical)

## Purpose and precedence

This document is the **single canonical reference** for:

- detection pipeline ordering
- score definitions, weights, and thresholds
- how scores connect to promotion, collapse, and output fields

When other docs disagree on numbers or ordering, **this file wins**. It is aligned with `module-and-seam-scoring.md` for all formulas and MVP thresholds.

| Topic | Primary source | Notes |
| --- | --- | --- |
| Module / seam / visibility / noise scoring | `module-and-seam-scoring.md` | Weights and bands reproduced below |
| Analysis object shapes | `inferred-module-and-seam-schema.md` | Field names and `analysisMeta.thresholds` |
| Pipeline sketch | `detection-flow-pseudocode.md` | Updated mentally against this doc; pseudocode weights for surface visibility were superseded |
| Caller heuristics (meaning of callers, not raw math) | `caller-based-visibility-and-seams.md`, `caller-heuristic-edge-cases.md` | Behavioral rules; numeric visibility comes from this doc |
| Industry framing | `module-identification.md` | Non-normative background |

## Design principles (non-negotiable)

1. **Multiple weak signals** beat one hard rule; every promoted artifact should carry **evidence**.
2. **Module inference and seam inference stay separate** — modules first, then cross-boundary relationships.
3. **Noise demotes; it does not delete** — elements and edges remain in the graph; UI defaults may hide them.
4. **Caller counts inform visibility and seam qualification**, not module identity by themselves.

## Detection pipeline (ordered)

These stages are **normative** for implementers.

1. Load repository metadata and detect frameworks / package layout.
2. Collect analyzable source files (MVP: TypeScript and JavaScript; file-level elements unless extended).
3. Parse files into elements; extract **import-style dependencies** and basic flags (public export, generated, test-only, framework entry when detectable).
4. Classify **architectural roles** (see role catalog below); roles feed scores and explanations, not a single boolean.
5. Build the **dependency graph** (elements + dependencies); enrich with framework entry points and export surfaces where available.
6. **Infer module candidates** from structural groups reconciled with graph communities (`inferInitialClusters` style).
7. For each module candidate, compute **module candidate score** and evidence; **promote** modules at or above the module threshold; assign elements to modules (best-effort, may leave unassigned internals).
8. For each element, compute **metrics** (distinct callers, distinct calling modules, fan-in/out, downstream reach as available) and **noise score**.
9. For each element, compute **surface visibility score** using the canonical formula below; set `collapsedByDefault` when `surfaceVisibilityScore` is **strictly below** `analysisMeta.thresholds.visibilityCollapseBelow` (default 50).
10. Derive **seam candidates** from dependencies that cross module boundaries (or module–adapter boundaries); compute **seam score** and evidence; **promote** seams at or above the seam threshold.
11. Run **violation** detectors (cycles, deep imports, boundary leaks, high coupling) as a separate pass over modules + graph.
12. Emit the normalized analysis document (`repository`, `snapshot`, `modules`, `elements`, `dependencies`, `seams`, `violations`, `analysisMeta`).

## Role catalog (MVP vs extended)

**Canonical role list** for scoring and explanations (from `module-and-seam-scoring.md`):

route, controller, facade, service, domain model, repository, adapter, event producer, event consumer, store, UI component, util, constants, types, generated, test, unknown (implementation-defined bucket).

**MVP implementation** may start with a **reduced subset** (as in `detection-flow-pseudocode.md` “MVP simplifications”) if each omitted role maps to `unknown` or the nearest neighbor (e.g. “service” for generic business logic). The **schema** still uses string roles; partial MVP coverage is OK if documented in `analysisMeta`.

## Score definitions

### 1. Module candidate score (0–100 scale in output)

**Purpose:** Likelihood that a cluster is a meaningful architectural module.

**Component signals (illustrative weights — canonical):**

```text
moduleCandidateScore =
  0.25 * structuralBoundaryScore +
  0.25 * cohesionScore +
  0.20 * encapsulationScore +
  0.20 * domainNamingScore +
  0.10 * roleDiversityScore -
  0.20 * utilityNoisePenalty
```

**Interpretation bands:**

| Range | Meaning |
| --- | --- |
| 80–100 | Strong module candidate |
| 60–79 | Likely module — promote if ≥ module threshold |
| 40–59 | Ambiguous — prefer review / lower default confidence |
| &lt; 40 | Weak — treat as technical grouping unless user overrides |

**Schema mapping:** Persist subcomponents in `module.score` (`moduleCandidate`, cohesion, encapsulation, domain naming, noise penalty, etc.) and top-level `confidence` derived consistently from the final score.

### 2. Noise score (element-level)

**Purpose:** Down-rank technical clutter for visibility and seams.

High-noise indicators include: util/helper naming, constants-only or types-only passive files, generated paths, framework plumbing, test-only, very low complexity with no architectural role, meaningless barrel re-exports.

**Rules:** Noise **never** removes nodes or edges. It **does** reduce visibility, seam promotion appetite, and default emphasis in views.

### 3. Surface visibility score (element-level, 0–100)

**Purpose:** Progressive disclosure — what appears at higher zoom levels.

**Canonical formula** (supersedes the older weights in `detection-flow-pseudocode.md`):

```text
surfaceVisibilityScore =
  0.20 * callerCountScore +
  0.25 * crossModuleCallerScore +
  0.20 * publicSurfaceScore +
  0.20 * architecturalRoleScore +
  0.15 * downstreamReachScore -
  0.30 * noiseScore
```

**Signal coverage note:** `module-and-seam-scoring.md` lists **framework entry-point status** as a positive input. There is **no separate weighted term** in the canonical formula. Implementations **must** reflect entry points through **`architecturalRoleScore`** (e.g. elevated score for `route` / controller entry files) and/or **`publicSurfaceScore`** when the framework treats the file as a published boundary. Document the chosen mapping in evidence.

**Interpretation bands:**

| Range | Default UI behavior |
| --- | --- |
| ≥ 75 | Eligible for top-level / module-level prominence (`analysisMeta.thresholds.surfaceVisibility`) |
| ≥ `visibilityCollapseBelow` and &lt; 75 | Mid-level views; not collapsed by default |
| &lt; `visibilityCollapseBelow` | **Collapsed by default** in higher-level views (still in model) |

**Caller rules (behavioral):** Single meaningful caller + not an entry/boundary → collapsed by default aligns with low visibility unless other terms rescue the score (`caller-based-visibility-and-seams.md`). Multi-caller alone **does not** imply a seam.

### 4. Seam score (candidate dependency bundle, 0–100)

**Purpose:** Highlight **meaningful** boundary interactions, not every import.

**Canonical formula:**

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

**Interpretation bands:**

| Range | Meaning |
| --- | --- |
| 80–100 | Strong seam |
| 60–79 | Likely seam — promote if ≥ seam threshold |
| 40–59 | Candidate — show in exploratory panels, lower emphasis |
| &lt; 40 | Ordinary dependency noise |

## MVP thresholds (configurable)

These values are **canonical** and match `inferred-module-and-seam-schema.md` → `analysisMeta.thresholds` and `module-and-seam-scoring.md`:

| Key | Value | Use |
| --- | ---: | --- |
| `moduleCandidate` | 60 | Promote inferred modules |
| `surfaceVisibility` | 75 | Treat as “high visibility” for top-level / module views |
| `visibilityCollapseBelow` | 50 | Elements with `surfaceVisibilityScore` **&lt;** this value get `collapsedByDefault: true` |
| `seamPromotion` | 65 | Promote seam records |
| `noiseSuppression` | 60 | Default filtering / demotion of noisy edges or nodes in UI |

**Implementation note:** `surfaceVisibility` (75) is **prominence**, not collapse. Collapse is driven solely by `visibilityCollapseBelow` vs `surfaceVisibilityScore`.

## Output and explainability

- Every **module**, **element** (where relevant), and **seam** should carry **evidence** entries compatible with `inferred-module-and-seam-schema.md`.
- **User overrides** (future) must not erase inference evidence; store alongside or in a patch layer.

## Resolved conflicts (audit trail)

1. **Surface visibility weights** — `detection-flow-pseudocode.md` used different coefficients and a dedicated `entryScore` term. **Resolution:** use the **six-term** formula from `module-and-seam-scoring.md`; fold framework entry points into role/public signals and evidence.
2. **When to collapse** — Pseudocode used `visibilityScore < 50` for `collapsedByDefault`. **Resolution:** keep **strictly below 50** as the default collapse rule, exposed as `analysisMeta.thresholds.visibilityCollapseBelow`. **75** remains “top-level prominence” (`surfaceVisibility`) — two different concepts.
3. **Seam weights** — Pseudocode and scoring doc agree; no change.
4. **Module score shape** — Pseudocode only exposed `scoreModuleCandidate`; **resolution:** persist full sub-scores per schema for explainability.
5. **MVP roles** — Reduced MVP set in pseudocode vs full role list in scoring doc. **Resolution:** full list is canonical vocabulary; MVP may emit a subset with explicit mapping to `unknown` / nearest role, recorded in `analysisMeta` if needed.

## Related documents

- `module-and-seam-scoring.md` — detailed rationale and future tuning
- `detection-flow-pseudocode.md` — step-by-step pseudocode (should be updated to reference this file for weights)
- `inferred-module-and-seam-schema.md` — JSON examples
- `caller-based-visibility-and-seams.md` — caller semantics
- `module-identification.md` — research framing
