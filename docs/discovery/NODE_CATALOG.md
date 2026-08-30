# Architecture Node & Module Catalog — Anantham V2

This document catalogues the active domain entities, repositories, event stores, reducers, projections, and recovery modules across the codebase.

---

## 1. Domain Entities (`src/domain/`)

- [`Project`](file:///C:/herness/src/domain/project.ts): Root workspace container with configuration, permissions, and metadata.
- [`Session`](file:///C:/herness/src/domain/session.ts): Execution session tracking hierarchical tree relationships (`parentSessionId`, `rootSessionId`, `forkedAtEventId`, `depth`).
- [`Task`](file:///C:/herness/src/domain/task.ts): Bounded unit of work with state machine (`queued` → `claimed` → `running` → `waiting_approval` / `blocked` / `paused` / `verifying` / `completed` / `failed` / `cancelled`).
- [`HarnessEvent`](file:///C:/herness/src/domain/event.ts): Authoritative immutable domain event with correlation and causation tracking.
- [`Checkpoint`](file:///C:/herness/src/domain/checkpoint.ts): Durable state recovery snapshot manifest with SHA-256 validation.
- [`ContentObject`](file:///C:/herness/src/domain/content.ts): Multimodal payload representation with SHA-256 integrity and MIME classification.
- [`Attachment`](file:///C:/herness/src/domain/attachment.ts): External user- or system-supplied file attached to sessions/tasks.
- [`Artifact`](file:///C:/herness/src/domain/artifact.ts): Durable output artifact produced by agent execution.
- [`MemoryItem`](file:///C:/herness/src/domain/memory.ts): Scoped long-term memory node with importance weighting and provenance.
- [`ContextPlan`](file:///C:/herness/src/domain/context.ts): Token budget and context assembly plan for LLM prompting.
- [`Provenance`](file:///C:/herness/src/domain/provenance.ts): Full lineage and causation chain metadata.
- [`SecurityMetadata`](file:///C:/herness/src/domain/security.ts): Classification, clearance level, and sandbox security constraints.

---

## 2. Persistence Repositories (`src/persistence/repositories/`)

- [`ProjectRepository`](file:///C:/herness/src/persistence/repositories/project-repository.ts): Relational operations for projects.
- [`SessionRepository`](file:///C:/herness/src/persistence/repositories/session-repository.ts): Hierarchical session persistence.
- [`TaskRepository`](file:///C:/herness/src/persistence/repositories/task-repository.ts): Task state persistence and state transition validation.
- [`EventRepository`](file:///C:/herness/src/persistence/repositories/event-repository.ts): Append-only event persistence and stream querying.
- [`CheckpointRepository`](file:///C:/herness/src/persistence/repositories/checkpoint-repository.ts): Checkpoint manifest storage.
- [`ArtifactRepository`](file:///C:/herness/src/persistence/repositories/artifact-repository.ts): Durable artifact metadata storage.
- [`AttachmentRepository`](file:///C:/herness/src/persistence/repositories/attachment-repository.ts): Attachment tracking.
- [`MemoryRepository`](file:///C:/herness/src/persistence/repositories/memory-repository.ts): Scoped memory storage.

---

## 3. Event & State Engine (`src/event-state/`)

- [`EventStore`](file:///C:/herness/src/event-state/event-store.ts): Append-only event store with transactional guarantees and subscriber dispatching.
- [`reconstructSessionState`](file:///C:/herness/src/event-state/reconstruction/session-reconstruct.ts): Pure reducer folding events into session aggregate state.
- [`reconstructTaskState`](file:///C:/herness/src/event-state/reconstruction/task-reconstruct.ts): Pure reducer folding events into task aggregate state.
- [`SessionSummaryProjection`](file:///C:/herness/src/event-state/projections/session-summary-projection.ts): Real-time aggregated session summary read-model.
- [`TaskBoardProjection`](file:///C:/herness/src/event-state/projections/task-board-projection.ts): Kanban/task board projection for active workflows.
- [`ProjectionManager`](file:///C:/herness/src/event-state/projections/projection-manager.ts): Coordinates multiple projections and handles zero-loss rebuilds from event log.
- [`SessionTreeManager`](file:///C:/herness/src/event-state/session-tree/session-tree-manager.ts): Manages tree navigation, branching, and speculative forking.

---

## 4. Recovery Subsystem (`src/recovery/`)

- [`CheckpointManifestBuilder`](file:///C:/herness/src/recovery/checkpoint-manifest.ts): Computes deterministic SHA-256 digests and builds signed checkpoints.
- [`CheckpointValidator`](file:///C:/herness/src/recovery/checkpoint-validator.ts): Validates cryptographic digests, artifact existence/hashes, and event offset boundaries.
- [`LeaseManager`](file:///C:/herness/src/recovery/lease-manager.ts): Manages exclusive task leases, heartbeat renewals, and automated stale lease reclamation.
- [`OrphanDetector`](file:///C:/herness/src/recovery/orphan-detector.ts): Scans relational tables for orphaned tasks, sessions, artifacts, attachments, and checkpoints.
- [`CrashRecoveryEngine`](file:///C:/herness/src/recovery/crash-recovery-engine.ts): Orchestrates SQLite integrity checks, lease reclamation, orphan detection, and projection synchronization.
- [`RecoveryRecord`](file:///C:/herness/src/recovery/recovery-record.ts): Structured audit trail recording recovery execution outcomes.
