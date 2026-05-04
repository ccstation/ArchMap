# Module Identification Research Note

## Purpose
This note summarizes established industry concepts and mechanisms for identifying modules in an application, and explains how they can inform ArchMap.

## Short answer
There is no single universal industry standard that automatically identifies modules in every codebase.

Instead, module identification in practice is based on a combination of:
- architectural principles
- packaging and code organization conventions
- dependency analysis
- runtime boundaries
- team and ownership signals

For ArchMap, this means module detection should be framed as an inference process built on established signals, not as a strict standards-based extraction.

## What is a module?
In practice, a module usually means a cohesive unit of software with:
- a focused responsibility
- relatively strong internal cohesion
- relatively weaker external coupling
- a meaningful boundary or interface
- some degree of encapsulation

Depending on the system, a module may be represented as:
- a package
- a namespace
- a top-level folder
- a library in a monorepo
- a deployable service
- a bounded context
- a component with a public API

## Established approaches used in industry

### 1. Domain-Driven Design and bounded contexts
One of the strongest conceptual foundations for module identification is Domain-Driven Design.

A bounded context groups behavior, terminology, and models that belong to the same business area.
Examples:
- Catalog
- Checkout
- Billing
- Identity

#### Why it matters
This is often the best way to identify meaningful business modules.

#### Limits
- difficult to infer purely from source code
- code structure does not always reflect domain boundaries clearly
- requires interpretation of business language and ownership

## 2. Package, namespace, and folder structure
A very common practical mechanism is to treat the existing code organization as an indicator of module boundaries.

Examples:
- `packages/auth`
- `src/catalog`
- `libs/payments`
- Java packages
- .NET projects or assemblies
- Maven or Gradle modules

#### Why it matters
This is one of the easiest and most reliable machine-detectable signals.

#### Limits
- folders are sometimes accidental rather than architectural
- large folders may contain multiple modules
- teams often organize by technical layer rather than business capability

## 3. Layered and component-based architecture
Many systems are divided into layers or components.
Common patterns include:
- presentation
- application
- domain
- infrastructure

Also seen in:
- Clean Architecture
- Hexagonal Architecture
- Onion Architecture

#### Why it matters
These patterns provide structure and can help group code.

#### Limits
- layers are not the same as business modules
- a module may cut across multiple technical layers
- layer-based grouping alone is often too coarse or misleading

## 4. Static dependency analysis
A well-established technical mechanism for identifying structure is dependency analysis.

This includes examining:
- imports
- exports
- call relationships
- package references
- usage frequency
- graph clustering

Modules can often be inferred where code has:
- dense internal connectivity
- sparse external dependencies
- relatively stable interfaces

#### Why it matters
This is one of the strongest technical foundations for an architecture discovery tool.

#### Limits
- dependency graphs can be noisy
- not all dependencies are equally meaningful
- static relationships alone may miss business meaning

## 5. Architecture conformance and rule-based boundaries
Many teams define or enforce architecture boundaries using rules.
Examples include:
- ArchUnit in Java
- dependency-cruiser in JavaScript and TypeScript
- Nx project boundary rules
- Bazel package boundaries
- custom dependency rules in CI

These approaches usually assume modules already exist, but they help validate and refine boundaries.

#### Why it matters
They provide explicit signals about intended architecture.

#### Limits
- usually not enough to discover modules from scratch
- rule quality depends on existing architecture discipline

## 6. Deployability and runtime boundaries
In some systems, module boundaries are identified through runtime characteristics.
Examples:
- microservices
- deployable apps
- APIs
- event streams
- data ownership

#### Why it matters
Useful for system-level or service-level architecture mapping.

#### Limits
- less reliable for discovering internal monolith modules
- runtime boundaries may not reflect internal code organization cleanly

## 7. Team and ownership boundaries
Organizations often treat module boundaries as ownership boundaries.
Signals include:
- CODEOWNERS
- team-owned directories
- service ownership metadata
- ADRs and documentation

#### Why it matters
Ownership is often a strong indicator of intended modularity.

#### Limits
- ownership can lag behind code reality
- may reflect people and process more than architecture quality

## Related software architecture principles
These principles are commonly used to reason about modules and should inform ArchMap.

### Cohesion
How strongly related the contents of a module are.

### Coupling
How strongly a module depends on others.

### Information hiding
Whether a module hides internal complexity behind a stable interface.

### Stable Dependencies Principle
Modules should depend in the direction of stability.

### Common Closure Principle
Things that change together should live together.

### Common Reuse Principle
Things reused together should be grouped together.

### Conway’s Law
Architecture often mirrors communication structures in teams.

## Relevant industry standards and models
There is no single universal module-identification standard, but several standards and models are relevant.

### C4 model
Widely used for visualizing software architecture at multiple levels.
Useful as an output and explanation model.
Not a discovery algorithm.

### UML component/package views
Can model modules, packages, and dependencies.
Useful for representation.
Not sufficient by itself to identify modules automatically.

### ISO/IEC/IEEE 42010
A standard for architecture description.
Useful for how to document architecture and viewpoints.
Not a rule for discovering modules from code.

## Practical conclusion for ArchMap
ArchMap should not claim to use a single industry standard for module identification.

Instead, it should state that it infers modules using established software architecture signals, including:
- package and folder boundaries
- dependency graph analysis
- cohesion and coupling indicators
- public interface detection
- framework and runtime entry points
- optional human confirmation and editing

This is more accurate and more credible.

## Recommended framing for ArchMap
A good framing would be:

**ArchMap infers likely architectural modules from code structure, dependency patterns, and boundary signals, then helps users refine and validate those modules.**

## Implications for product design
This research suggests a few important product decisions.

### 1. Detection should be heuristic, not absolute
The product should present modules as inferred candidates with confidence, not as unquestionable truth.

### 2. Human adjustment should be part of the workflow
Users should be able to:
- rename modules
- merge or split modules
- mark intended seams
- define rules for future scans

### 3. Multiple signals should be combined
No single signal is enough.
ArchMap should combine:
- explicit structural boundaries
- inferred dependency clusters
- semantic naming patterns
- framework-specific entry points
- optional ownership metadata

### 4. Output should explain why a module was inferred
Trust improves when users can see evidence such as:
- common folder ancestry
- high internal import density
- stable entry points
- strong domain naming similarity

## Recommended first implementation approach
For an MVP, the most practical strategy is:
1. detect explicit project and package boundaries
2. infer candidate modules from folders and dependency clustering
3. identify public entry points and cross-boundary imports
4. score cohesion and coupling
5. allow user review and correction

## Summary
There is no universal standard for automatically identifying modules in a codebase.

However, there are strong industry concepts and mechanisms that can guide the process, especially:
- Domain-Driven Design bounded contexts
- package and workspace boundaries
- static dependency analysis
- architecture conformance rules
- cohesion and coupling principles

These should form the intellectual and technical basis for ArchMap’s module identification approach.
