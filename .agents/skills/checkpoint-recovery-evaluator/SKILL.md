---
name: checkpoint-recovery-evaluator
description: Validates checkpoint manifests, orphan detection, crash recovery, /resume state reconstruction, and lease lifecycle in Anantham V2.
---

# Checkpoint Recovery Evaluator Skill

Use this skill when developing or testing checkpoints, crash recovery, orphan state detection, or `/resume` execution.

## Core Rules

1. **Durable Checkpoint Manifest**:
   - A checkpoint must record:
     - `eventId` (exact stream offset)
     - `sessionState` & `taskStates`
     - SHA-256 hashes of all referenced artifacts
     - Pending approval states
2. **Crash Recovery Sequence**:
   - On startup, the recovery engine validates SQLite schema, executes `PRAGMA integrity_check`, sweeps for orphan artifacts without metadata, evicts expired agent leases, and reconstructs active projections.
3. **Lossless `/resume`**:
   - Resuming a session restores context without duplicating previously executed non-idempotent side effects.
