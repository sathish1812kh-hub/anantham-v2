---
name: event-state-projection-sync
description: Manages append-only immutable event streams, deterministic state reconstruction reducers, rebuildable read projections, and zero-mutation session branch trees in Anantham V2.
---

# Event-State Projection Sync Skill

Use this skill when defining new domain event types, updating aggregate reducers (`reconstructSessionState`, `reconstructTaskState`), adding projections, or working with session trees.

## Core Rules

1. **Append-Only Immutability**:
   - Events can never be modified or deleted. State corrections are appended as new compensating events.
2. **Deterministic Reducers**:
   - Reducers must be pure synchronous functions with zero external side-effects.
3. **Lossless Projection Rebuild**:
   - `ProjectionManager.rebuildAll()` must be capable of resetting and re-projecting state from offset 0 without data loss.
4. **Zero-Mutation Session Branching**:
   - When branching a session (`SessionTreeManager.branchSession`), child sessions inherit parent event history up to `forkedAtEventId` without mutating parent state.
