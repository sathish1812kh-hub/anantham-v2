# Architecture Decision Log (ADR) — Anantham V2

This document records architectural decisions, their trade-offs, and compliance rationales.

---

## ADR-001: Native Node.js `node:sqlite` Storage Engine

- **Status**: `ACCEPTED`
- **Date**: 2026-08-30
- **Context**: Anantham V2 requires a local-first, zero-external-dependency, embedded persistence engine capable of zero-data-loss durability (RPO 0).
- **Decision**: Use Node.js built-in `node:sqlite` module (`DatabaseSync`) rather than third-party native binaries (e.g. `better-sqlite3` or ORM bloat). Configure WAL mode (`PRAGMA journal_mode = WAL`), synchronous durability (`PRAGMA synchronous = FULL`), and enforce foreign keys (`PRAGMA foreign_keys = ON`).
- **Consequences**: Zero native binary compilation issues on Windows/Linux/macOS, minimal dependency footprint, synchronous execution semantics matching ACID transaction requirements.

---

## ADR-002: Dual Event-Sourced & Relational Persistence Model

- **Status**: `ACCEPTED`
- **Date**: 2026-08-30
- **Context**: The runtime requires complete auditability, event replay, and time-travel debugging while also providing fast relational lookups for active sessions, projects, and tasks.
- **Decision**: Implement an authoritative append-only `events` table alongside relational domain tables (`projects`, `sessions`, `tasks`, `artifacts`, `attachments`, `checkpoints`, `memory_items`). Domain repositories update relational entities inside the same transaction as event appending, while `ProjectionManager` enables pure read-model rebuilds from the event log.
- **Consequences**: Guarantees RPO 0, provides instant query performance for active entities, and allows full disaster recovery reconstruction from the raw event stream.

---

## ADR-003: Hierarchical Immutable Session Trees

- **Status**: `ACCEPTED`
- **Date**: 2026-08-30
- **Context**: Agents and users need to branch workflows, explore speculative alternatives, and fork session states without polluting or mutating the main conversation/session.
- **Decision**: Model sessions with `parentSessionId`, `rootSessionId`, `forkedAtEventId`, and `depth`. When a session is branched or forked, child sessions inherit parent event history up to `forkedAtEventId` without copying or modifying parent events.
- **Consequences**: Zero memory duplication, instant branch creation, isolation of experimental agent actions.

---

## ADR-004: Zod Runtime Schema Validation & Domain Immutability

- **Status**: `ACCEPTED`
- **Date**: 2026-08-30
- **Context**: Dynamic data crossing network, storage, or agent boundaries can introduce subtle type corruption or prototype poisoning.
- **Decision**: Define runtime Zod schemas for all 12 domain entities (`Project`, `Session`, `Task`, `HarnessEvent`, `Checkpoint`, `ContentObject`, `Attachment`, `Artifact`, `MemoryItem`, `ContextPlan`, `Provenance`, `SecurityMetadata`) and apply `Object.freeze` deeply on constructed entities.
- **Consequences**: Complete runtime type safety, guaranteed domain immutability, zero unauthorized state mutation.
