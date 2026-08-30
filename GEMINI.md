# Anantham V2 — Project Rules & Ingestion Governance

This file defines the mandatory startup protocol and operational rules for the Anantham V2 Platform.

---

## Mandatory Boot Protocol (Phase 0)

Before executing any developer task, you must establish context using the following steps:

1. **Read state**: Open and read [`docs/discovery/current-state.md`](file:///C:/herness/docs/discovery/current-state.md) to locate the active task and focus modules.
2. **Verify Git status**: Run `git status --porcelain` to check for unrecorded drift.
3. **Read tasks & master plan**: Open and read [`docs/discovery/active-tasks.md`](file:///C:/herness/docs/discovery/active-tasks.md) and [`ANANTHAM PROJECT SOURCES/DEVELOPMENT/ANANTHAM_V2_MASTER_DEVELOPMENT_PLAN.md`](file:///C:/herness/ANANTHAM%20PROJECT%20SOURCES/DEVELOPMENT/ANANTHAM_V2_MASTER_DEVELOPMENT_PLAN.md).
4. **Confirm rules**: Reference the rulebooks [`docs/discovery/V1.0-Anantham-Orchestrator.md`](file:///C:/herness/docs/discovery/V1.0-Anantham-Orchestrator.md) and [`ANANTHAM PROJECT SOURCES/00_ANANTHAM_ENGINEERING_PLAYBOOK.md`](file:///C:/herness/ANANTHAM%20PROJECT%20SOURCES/00_ANANTHAM_ENGINEERING_PLAYBOOK.md).
5. **Verify Baseline Health**: Verify type safety (`npm run typecheck`) and automated tests (`npm test`). All tests must pass before starting any new task.
6. **Summarize & Prompt**: Output a short "Context Recovery Report" (Active Task, Git Status, Identified Risks) and request user confirmation before making any architectural code modifications.

---

## Source Authority Hierarchy

When determining requirements and architecture, strictly obey this precedence:

```text
1. System/security invariants (RPO-0 durability, ToolGateway isolation, zero-untrusted-execution)
2. Anantham V2 PRD requirements (Part 1, Part 2, Part 3)
3. Accepted ADRs (docs/discovery/decision-log.md)
4. Versioned contracts/types/interfaces (src/domain, src/persistence, src/event-state)
5. Unit and integration tests (tests/)
6. Existing implementation
7. Project-specific instructions
8. Current task request
9. Model assumptions
```

> **A lower-level source cannot silently override a higher-level source.**

---

## Core Operational Constraints

- **Stateless Boot**: Never assume previous chat context or session history exists.
- **RPO 0 Durability**: All authoritative state mutations must be transactionally committed to SQLite in WAL mode with `synchronous = FULL`.
- **Event Immutability**: Historical events are immutable facts. Never edit historical events in place; use compensations or invalidations.
- **Authoritative vs. Derived**: Projections, caches, and UI state are rebuildable from the event stream and SQLite state. Never treat derived data as the primary authority.
- **ToolGateway Authority**: Agents never execute tools directly. All tool calls must route through the ToolGateway for schema validation, risk classification, policy enforcement, and audit recording.
- **Pre-Edit Blast-Radius Verification**: Never modify shared domain entities or repository contracts without checking dependent callers and running covering test suites.
- **Mandatory Checklist & Multi-Engine Synchronization**: At the end of every completed work package:
  1. Update [`docs/discovery/current-state.md`](file:///C:/herness/docs/discovery/current-state.md).
  2. Update [`docs/discovery/active-tasks.md`](file:///C:/herness/docs/discovery/active-tasks.md).
  3. Update [`ANANTHAM PROJECT SOURCES/DEVELOPMENT/ANANTHAM_V2_MASTER_DEVELOPMENT_PLAN.md`](file:///C:/herness/ANANTHAM%20PROJECT%20SOURCES/DEVELOPMENT/ANANTHAM_V2_MASTER_DEVELOPMENT_PLAN.md) (checkbox + changelog entry).
  4. Run `npm run sync:all` to synchronize CodeGraph, Graphify, Neo4j, Graphiti episodic memory, scorecard, and commit/push to GitHub for stateless recovery.
  5. Output the standardized **ANANTHAM ENGINEERING VERDICT**.

---

## Mandatory Engineering Verdict Format

Every completed task MUST finish with the following structured verdict block:

```text
======================================================
           ANANTHAM ENGINEERING VERDICT
======================================================
Phase: <Phase ID, e.g. P1>
Subphase: <Subphase ID, e.g. P1.4>
Task: <Task Name & ID>

VERDICT: <PASS | PASS_WITH_RISKS | BLOCKED | FAIL | ARCHITECTURE_DECISION_REQUIRED>

WHAT IT WAS SUPPOSED TO DO:
<Description of requirement>

WHAT IT ACTUALLY DID:
<Concrete changes performed>

FILES CHANGED:
<List of modified and created files>

CONTRACTS:
<Entities, interfaces, and schemas added or updated>

STATE/PERSISTENCE:
<SQLite tables, migrations, or event types affected>

SECURITY:
<Policies, trust boundaries, or validations enforced>

RECOVERY:
<Crash, restart, or resume semantics preserved>

TESTS ACTUALLY RUN:
<Test files and number of passing assertions>

VERIFICATION EVIDENCE:
<Build status, typecheck status, scorecard score>

RISKS:
<Known risks or None>

UNRESOLVED:
<Open questions or None>

CHECKLIST UPDATED: YES

NEXT:
<Next task in the Master Development Plan>
======================================================
```
