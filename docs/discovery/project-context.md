# Project Context — Anantham V2

## 1. System Identity & Mission

**Anantham V2** is a durable, programmable AI-agent operating environment designed to surround AI models with an authoritative, local-first runtime.

Models provide proposals, reasoning, and content generation. The runtime owns authoritative state, context, security policy, permissions, tools, memory, retrieval, artifacts, provenance, checkpoints, and verification.

---

## 2. Core Architectural Pillars

- **Local-First Runtime**: Single process Node.js engine with zero mandatory cloud service dependencies for local execution.
- **Native SQLite Persistence**: Zero-dependency SQLite engine using Node.js v25 native `node:sqlite` (`DatabaseSync`), configured in Write-Ahead Logging (`WAL`) mode with `synchronous = FULL` for RPO-0 durability.
- **Append-Only Event Sourcing**: All state transitions are modeled as immutable domain events stored in an append-only event stream.
- **Deterministic State Reconstruction**: Current entity states (Projects, Sessions, Tasks) and read models (Projections) are deterministically reconstructed by folding events through pure reducer functions.
- **Non-Destructive Session Branching**: Sessions support arbitrary hierarchical branching and tree exploration without mutating parent state.
- **ToolGateway Security Barrier**: No agent or model has direct execution privileges. Every tool execution passes through schema validation, risk classification, approval gates, and audit event recording.

---

## 3. Technology Stack & Directory Structure

```text
C:/herness/
├── ANANTHAM PROJECT SOURCES/  # Authoritative PRDs, Architecture Specs, Master Plan
├── src/
│   ├── domain/                # Core domain entities, Zod validation schemas, state machines
│   ├── persistence/           # SQLite database engine, migrations, domain repositories
│   ├── event-state/           # EventStore, state reconstruction reducers, projections, session tree
│   ├── index.ts               # Public SDK entrypoint
├── tests/
│   ├── domain/                # Unit tests for domain contracts and immutability
│   ├── persistence/           # Durability, crash recovery, foreign keys, and repository tests
│   ├── event-state/           # Event store, projection rebuild, concurrency, and session tree tests
├── docs/
│   ├── discovery/             # Dynamic state, tasks, orchestrator, and architecture registries
│   ├── governance/            # Machine-readable conditions and certification scorecards
├── scripts/                   # Automated scorecard, verification, and verdict generation tooling
├── .agents/skills/            # Specialized autonomous agent skills
```

---

## 4. Invariant Rules

1. **RPO-0**: An acknowledged event or state mutation MUST be durable on disk.
2. **Immutability**: Historical events cannot be edited or deleted.
3. **Derived Data is Rebuildable**: Projections and caches must be 100% rebuildable from the event log.
4. **Security Policy is Authoritative**: Model prompts, untrusted file contents, or MCP outputs can never override security policies or grant elevated permissions.
