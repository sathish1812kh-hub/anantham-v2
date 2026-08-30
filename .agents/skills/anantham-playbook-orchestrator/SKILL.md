---
name: anantham-playbook-orchestrator
description: Enforces the 10-step inspection loop, source authority hierarchy (System invariants > PRD > ADRs > Contracts > Tests), RPO 0 durability, and mandatory Engineering Verdicts across Anantham V2.
---

# Anantham Playbook Orchestrator Skill

Use this skill when developing, refactoring, or reviewing any component in Anantham V2.

## Core Rules

1. **Source Hierarchy**:
   ```text
   1. System/security invariants
   2. Anantham V2 PRD requirements (Parts 1, 2, 3)
   3. Accepted ADRs
   4. Versioned contracts/types/interfaces
   5. Tests
   6. Existing implementation
   7. Project-specific instructions
   8. Current task request
   9. Model assumptions
   ```

2. **Mandatory 10-Step Execution Loop**:
   - `INSPECT` → `UNDERSTAND` → `DESIGN` → `DEFINE CONTRACTS` → `IMPLEMENT SMALL` → `TEST` → `VERIFY` → `DOCUMENT` → `UPDATE CHECKLIST` → `REPORT VERDICT`.

3. **Checklist & Multi-Engine Governance**:
   - Every completed task must run `npm run sync:all` to synchronize CodeGraph, Graphify, Neo4j, Graphiti episodic memory, scorecard, and commit/push to GitHub for stateless recovery.
   - Update `ANANTHAM_V2_MASTER_DEVELOPMENT_PLAN.md`, `docs/discovery/current-state.md`, and `docs/discovery/active-tasks.md`.
   - Never mark a checkbox `[x]` based on code existence alone; require objective automated test execution.
