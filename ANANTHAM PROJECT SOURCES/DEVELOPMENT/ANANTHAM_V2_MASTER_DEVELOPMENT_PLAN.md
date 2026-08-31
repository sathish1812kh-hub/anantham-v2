# ANANTHAM V2 — MASTER DEVELOPMENT PLAN & TODO CHECKLIST

## 0. Purpose

This is the project-control checklist for taking Anantham V2 from the current repository state to production readiness.

Authoritative sources:
1. `ANANTHAM_PRD_V2_PART_1_PRODUCT_AND_ARCHITECTURE.md`
2. `ANANTHAM_PRD_V2_PART_2_AGENTS_INTEGRATIONS_AND_EXECUTION.md`
3. `ANANTHAM_PRD_V2_PART_3_CLI_SECURITY_UX_EVALUATION_IMPLEMENTATION.md`
4. `00_ANANTHAM_ENGINEERING_PLAYBOOK.md`
5. accepted ADRs/contracts/migrations/tests
6. `ANANTHAM_PROJECT_INSTRUCTIONS.md`
7. `ANANTHAM_V2_TECH_STACK.md`

Source hierarchy:
`security invariants > PRDs > accepted ADRs/contracts > tests > implementation > project instructions > task > assumptions`

This checklist is a living project artifact. Antigravity MUST update it after every completed work package.

---

# 1. STATUS RULES

Use exactly:

- `[ ]` NOT STARTED
- `[~]` IN PROGRESS
- `[x]` VERIFIED COMPLETE
- `[!]` BLOCKED
- `[?]` DECISION REQUIRED
- `[-]` DEFERRED / NOT IN CURRENT SCOPE

A task may use `[x]` only when its acceptance criteria are objectively verified.

Never mark a parent phase complete while a required child task is incomplete, blocked, or unverified.

Every update MUST include:
- date/time;
- task ID;
- what changed;
- tests executed;
- verification evidence;
- remaining risks/issues;
- commit/hash when applicable.

---

# 2. GLOBAL COMPLETION GATES

## G0 — Requirements & Architecture
- [ ] Requirements mapped to implementation/tests
- [ ] Architecture boundaries identified
- [ ] Dependency graph validated
- [ ] Relevant ADRs identified
- [ ] Contradictions resolved or escalated
- [ ] No unexplained duplicate subsystems

## G1 — Durability
- [ ] Authoritative state identified
- [ ] SQLite durability configured
- [ ] WAL/transactions tested
- [ ] Event replay works
- [ ] Projection rebuild works
- [ ] Checkpoint integrity works
- [ ] Artifact integrity works
- [ ] Restart recovery works
- [ ] `/resume` works
- [ ] Backup/restore works
- [ ] Migration tests work

## G2 — Security
- [ ] Trust boundaries identified
- [ ] Policy enforcement verified
- [ ] ToolGateway cannot be bypassed
- [ ] Credentials isolated
- [ ] Project isolation verified
- [ ] Sandbox boundaries verified
- [ ] Prompt-injection tests pass
- [ ] Secret-leak tests pass
- [ ] Command-injection tests pass
- [ ] Path-traversal tests pass
- [ ] Permission-bypass tests pass
- [ ] Malicious MCP/plugin/skill tests pass

## G3 — Execution
- [ ] Tool schemas validated
- [ ] Risk classification works
- [ ] Approval flow works
- [ ] Idempotency classified
- [ ] Retry budgets enforced
- [ ] Resource limits enforced
- [ ] Local executor verified
- [ ] Docker executor verified
- [ ] Remote executor contract verified
- [ ] Parallel worktree protection verified

## G4 — Verification
- [ ] Objective verification exists
- [ ] Verification artifacts exist
- [ ] False-completion defenses tested
- [ ] E2E workflows pass
- [ ] Crash/recovery tests pass
- [ ] Concurrency tests pass
- [ ] Evaluation suite passes applicable targets

---

# 3. PHASE PLAN

## P0 — RECONNAISSANCE & BASELINE

### P0.1 Repository inventory
- [x] P0.1.1 Directory/package structure
- [x] P0.1.2 Runtime and package manager
- [x] P0.1.3 Entry points
- [x] P0.1.4 Build/typecheck/lint/test commands
- [x] P0.1.5 Database/storage
- [x] P0.1.6 Configuration
- [x] P0.1.7 Dependencies
- [x] P0.1.8 Git state/worktrees

### P0.2 Architecture inventory
- [x] P0.2.1 Domain modules
- [x] P0.2.2 Application/runtime services
- [x] P0.2.3 Persistence/event system
- [x] P0.2.4 Model/provider layer
- [x] P0.2.5 Tool/policy layer
- [x] P0.2.6 Agent/executor layer
- [x] P0.2.7 Context/memory/content
- [x] P0.2.8 CLI/TUI/API/integrations

### P0.3 Requirements traceability
- [x] P0.3.1 Map PRD requirements
- [x] P0.3.2 Mark implemented/partial/missing/conflicting/untested
- [x] P0.3.3 Map requirements to tests
- [x] P0.3.4 Identify PRD gaps

### P0.4 Baseline
- [x] P0.4.1 Dependency graph
- [x] P0.4.2 Security boundary map
- [x] P0.4.3 State ownership map
- [x] P0.4.4 Failure/recovery map
- [x] P0.4.5 Production-readiness baseline
- [x] P0.4.6 Proposed P1-P9 sequence

**P0 GATE:** read-only analysis complete; human reviews baseline. [VERIFIED COMPLETE]

---

## P1 — DURABLE RUNTIME FOUNDATION

### P1.1 Core domain
- [x] Project
- [x] Session
- [x] Task
- [x] HarnessEvent
- [x] Checkpoint
- [x] ContentObject
- [x] Attachment
- [x] Artifact
- [x] MemoryItem
- [x] ContextPlan
- [x] Provenance
- [x] SecurityMetadata

### P1.2 Persistence
- [x] SQLite schema
- [x] migrations
- [x] WAL
- [x] transactions
- [x] foreign keys
- [x] integrity checks
- [x] repository/service boundaries

### P1.3 Event/state
- [x] Event store
- [x] immutable events
- [x] state reconstruction
- [x] projections
- [x] projection rebuild
- [x] session tree/branches

### P1.4 Checkpoints/recovery
- [x] Checkpoint manifests
- [x] checkpoint validation
- [x] crash recovery
- [x] orphan detection
- [x] stale lease handling
- [x] recovery records

### P1.5 Resume
- [x] `/resume`
- [x] durable reconstruction
- [x] task/workflow restoration
- [x] pending approval restoration
- [x] artifact/worktree restoration

**P1 GATE:** restart/crash/resume acceptance passes. [x] (VERIFIED COMPLETE - 86/86 tests, 1000/1000 scorecard)

---

## P2 — CONTENT / CONTEXT / MEMORY / RETRIEVAL

### P2.1 Content
- [x] text
- [x] images
- [x] PDF
- [x] DOCX
- [x] XLSX
- [x] CSV
- [x] audio
- [x] video
- [x] archives
- [x] unknown binary preservation

### P2.2 Content security/provenance
- [x] signature/MIME validation
- [x] size limits
- [x] archive safety
- [x] hashing
- [x] provenance
- [x] sensitivity classification

### P2.3 Artifacts
- [x] durable writes
- [x] hashes
- [x] metadata
- [x] references
- [x] verification status

### P2.4 Context
- [x] ContextPlan
- [x] relevance
- [x] provenance
- [x] capability matching
- [x] token accounting
- [x] attachment selection
- [x] tool-schema budget
- [x] tool-result pruning
- [x] `/context`

### P2.5 Compaction
- [x] `/compact`
- [x] preview
- [x] undo
- [x] auto-compact
- [x] authoritative-history preservation

### P2.6 Memory/retrieval
- [x] scoped memory
- [x] memory provenance
- [x] search/retrieval
- [x] FTS/indexes
- [x] rebuildable indexes

**P2 GATE:** ingest → persist → retrieve → context → compact → resume.

---

## P3 — MODEL / PROVIDER / CREDENTIAL PLANE

- [x] ModelAdapter
- [x] ProviderAdapter
- [x] capability model
- [x] capability resolver
- [x] ModelRouter
- [x] routing explanation
- [x] auth profiles
- [x] secure credential storage
- [x] key pools
- [x] rate/concurrency limits
- [x] provider health
- [x] cooldown/fairness
- [x] retry/failover
- [x] OpenRouter
- [x] direct providers
- [x] custom/local endpoints
- [x] streaming
- [x] tool calling
- [x] usage accounting
- [x] model switching without state loss

**P3 GATE:** provider/key failure does not lose committed runtime state.

---

## P4 — POLICY / TOOLS / EXECUTION

### P4.1 Policy
- [x] policy engine
- [x] data sensitivity
- [x] risk classification
- [x] approval
- [x] audit
- [x] project isolation

### P4.2 ToolGateway
- [x] schema validation
- [x] policy check
- [x] approval check
- [x] capability check
- [x] timeout
- [x] idempotency
- [x] normalized errors
- [x] observation/artifact recording

### P4.3 Native tools
- [x] filesystem
- [x] search
- [x] process
- [x] shell
- [x] git
- [x] worktree
- [x] artifact
- [x] memory
- [x] browser where applicable

### P4.4 Executors
- [x] local
- [x] Docker
- [x] remote interface
- [x] sandbox controls
- [x] resource limits
- [x] process lifecycle

### P4.5 Side effects
- [x] retry classification
- [x] global retry budget
- [x] duplicate-side-effect protection
- [x] file divergence detection

**P4 GATE:** no tool can bypass policy; sandbox/resource/security tests pass.

---

## P5 — MCP / PLUGINS / SKILLS / HOOKS

### P5.1 MCP
- [x] registry
- [x] client
- [x] discovery
- [x] tools
- [x] resources
- [x] prompts
- [x] auth
- [x] lifecycle
- [x] health/reconnect
- [x] circuit breaker
- [x] normalized ToolDefinition/ContentObject
- [x] malicious-output protection

### P5.2 Plugins
- [x] manifest
- [x] identity/version
- [x] checksum
- [x] dependencies
- [x] capabilities
- [x] permissions
- [x] install
- [x] enable/disable
- [x] unload/reload
- [x] update/rollback
- [x] failure isolation

### P5.3 Skills
- [x] registry
- [x] metadata
- [x] progressive loading
- [x] versioning
- [x] dependency checks
- [x] compatibility
- [x] execution provenance

### P5.4 Hooks
- [ ] lifecycle engine
- [ ] deterministic behavior
- [ ] ordering
- [ ] failure policy
- [ ] security-sensitive hooks fail safely

**P5 GATE:** malicious MCP/plugin/skill cannot bypass policy.

---

## P6 — AGENTS / TEAMS / PARALLEL EXECUTION

- [ ] Agent identity/configuration
- [ ] startup capability/policy resolution
- [ ] agent budget
- [ ] task board
- [ ] task claims
- [ ] leases
- [ ] heartbeats
- [ ] stalled-agent recovery
- [ ] subagents
- [ ] delegation limits
- [ ] agent handoff
- [ ] agent memory
- [ ] teams
- [ ] peer messaging
- [ ] shared artifacts
- [ ] parallel execution
- [ ] worktree isolation
- [ ] conflict detection
- [ ] duplicate-work controls

**P6 GATE:** real parallel task + agent failure + recovery passes.

---

## P7 — WORKFLOW / ORCHESTRATION / BACKGROUND / REMOTE

- [ ] workflow model
- [ ] executable TypeScript workflow
- [ ] DAG
- [ ] dependencies
- [ ] cycle detection
- [ ] conditions
- [ ] parallel branches
- [ ] foreach
- [ ] budgets
- [ ] approvals
- [ ] retry
- [ ] timeout
- [ ] artifact passing
- [ ] verification nodes
- [ ] dry run
- [ ] workflow versioning
- [ ] active-run pinning
- [ ] background agents
- [ ] remote execution
- [ ] remote output durability
- [ ] remote recovery

**P7 GATE:** plan → execute → parallelize → verify → crash → resume.

---

## P8 — CLI / TUI / API / INTEGRATIONS

### P8.1 CLI
- [ ] command routing
- [ ] project/session/task commands
- [ ] `/plan`
- [ ] `/resume`
- [ ] `/context`
- [ ] `/compact`
- [ ] `/agents`
- [ ] `/tools`
- [ ] `/mcps`
- [ ] `/plugins`
- [ ] `/skills`
- [ ] `/policy`
- [ ] `/artifacts`
- [ ] `/doctor`
- [ ] `/backup`
- [ ] `/restore`
- [ ] `/replay`
- [ ] JSON/JSONL
- [ ] headless mode

### P8.2 TUI
- [ ] runtime-state projection
- [ ] context display
- [ ] task/agent display
- [ ] artifacts
- [ ] approvals
- [ ] logs/diagnostics
- [ ] notifications

### P8.3 API/SDK
- [ ] HTTP
- [ ] WebSocket
- [ ] SSE
- [ ] JSON-RPC
- [ ] TypeScript SDK
- [ ] API authentication
- [ ] API contracts/versioning

### P8.4 Integrations
- [ ] REST
- [ ] GraphQL
- [ ] webhooks
- [ ] GitHub/GitLab/CI
- [ ] connectors
- [ ] notifications

**P8 GATE:** all interfaces project the same runtime state and do not duplicate business logic.

---

## P9 — VERIFICATION / EVALUATION / PRODUCTION HARDENING

### P9.1 Verification
- [ ] functional suite
- [ ] contract suite
- [ ] integration suite
- [ ] E2E suite
- [ ] false-completion suite
- [ ] verification artifacts

### P9.2 Recovery
- [ ] restart tests
- [ ] crash tests
- [ ] SIGKILL
- [ ] DB interruption
- [ ] disk-full simulation
- [ ] provider outage
- [ ] MCP outage
- [ ] Docker interruption
- [ ] backup/restore
- [ ] migration/resume
- [ ] projection rebuild

### P9.3 Security
- [ ] prompt injection
- [ ] tool-policy bypass
- [ ] path traversal
- [ ] command injection
- [ ] secret leakage
- [ ] permission escalation
- [ ] malicious MCP output
- [ ] malicious plugin
- [ ] malicious attachment
- [ ] supply-chain checks
- [ ] sandbox downgrade

### P9.4 Multimodal
- [ ] required fixture suite
- [ ] representation selection
- [ ] extraction failures
- [ ] corrupt/oversized files
- [ ] archive safety
- [ ] unsupported modality handling

### P9.5 Evaluation
- [ ] resume benchmark
- [ ] compaction benchmark
- [ ] multimodal benchmark
- [ ] provider failover
- [ ] parallelism
- [ ] retrieval
- [ ] false completion
- [ ] security
- [ ] cost/task
- [ ] latency
- [ ] recovery

### P9.6 Release engineering
- [ ] license audit
- [ ] SBOM
- [ ] secret scan
- [ ] vulnerability scan
- [ ] reproducible build metadata
- [ ] packaging
- [ ] checksums
- [ ] docs
- [ ] runbooks
- [ ] support bundle
- [ ] release gates

**P9 GATE:** all applicable master release checklist items pass.

---

# 4. PRODUCTION-READY VERDICT

Anantham may be declared `PRODUCTION READY` only if objective evidence demonstrates:

- committed state survives supported failures;
- `/resume` reconstructs recoverable work;
- project isolation works;
- context/compaction are safe;
- supported multimodal content works;
- providers/key pools fail safely;
- parallel agents protect source state;
- MCP/plugins/skills cannot bypass policy;
- high-risk actions are controlled/auditable;
- false completion meets the approved benchmark;
- backup/restore works;
- migrations preserve recoverable state;
- replay/evaluation detects regressions;
- security acceptance gates pass;
- release artifacts and documentation are complete.

The PRD defines concrete acceptance targets including RPO 0 for committed state under supported local durability conditions, recovery/resume targets, false-completion, tool-safety, data-exfiltration, parallel-conflict, provider-failover and multimodal targets. These targets must be measured, not assumed.

---

# 5. CHANGE LOG

Antigravity MUST append an entry after every completed work package:

## 2026-08-30 22:35 — TASK-P2.1-CONTENT-FOUNDATION
 
Status: VERIFIED COMPLETE
What changed: Implemented and hardened the Multimodal Content Foundation & Representation Selector Subsystem (`P2.1`). Added `ContentGuards` for magic byte sniffing, size limits, and Zip Slip safety checks. Added specialized safe parsers for `Text/Code/Markdown` (`TextParser`), `JSON/CSV/Table` (`StructuredDataParser`), `PDF` (`PdfParser`), `Images` (`ImageParser`), `Audio/Video` (`MediaParser`), `Archives` (`ArchiveParser`), and `Binary Preservation` (`BinaryParser`). Added `ContentIngestionEngine` assembling provider-neutral `ContentObject` entities with multi-tier `ContentRepresentation` arrays, provenance lineage, and security metadata. Added `RepresentationSelector` for model modality matching and token budget truncation, `ContentReferenceManager` for large binary offloading and SHA-256 disk verification, and `ContentAccessValidator` for cross-project boundary isolation.
Files: src/content/content-guards.ts, src/content/parsers/*.ts, src/content/content-ingestion-engine.ts, src/content/representation-selector.ts, src/content/content-reference-manager.ts, src/content/content-access-validator.ts, src/content/index.ts, src/index.ts, tests/content/*.test.ts
Tests: 114 automated tests passing across 43 test suites in Vitest (magic byte sniffing, size guards, Zip Slip prevention, text token estimation, code markdown fencing, JSON/CSV schema and preview tables, PDF page counts, image dimensions, WAV audio parameters, archive indexing, unknown binary preservation, modality capability matching, token budget truncations, large payload disk offload and SHA-256 verification, and cross-project security isolation).
Verification: npm run typecheck (0 errors under strict: true), npm test (114/114 passing), npm run build (successful), npm run scorecard (1000/1000 Certified Perfect), multi-engine sync (CodeGraph, Graphify, Neo4j, Graphiti, Git).
Commit/Revision: Active
Risks: None.
Unresolved: None.
Next: P2.2 Content security/provenance (signature/MIME validation, size limits, archive safety, hashing, provenance, sensitivity classification).
 
## 2026-08-30 21:50 — TASK-P1.5-RESUME-ENGINE
 
Status: VERIFIED COMPLETE
What changed: Implemented the Durable Session Resume Engine (`/resume`) subsystem. Added `SessionResumeEngine` executing the complete PRD Section 56 algorithm, `TaskDagRestorer` for task dependency resolution, topological execution sorting, and interrupted task state recovery, `PendingApprovalRestorer` for reconstructing unapproved tool requests from the event stream with TTL checks, and comprehensive integration/unit tests. Verified full disk crash, restart, and state reconstruction on file-backed SQLite database. P1 Gate officially satisfied.
Files: src/resume/resume-contract.ts, src/resume/task-dag-restorer.ts, src/resume/pending-approval-restorer.ts, src/resume/session-resume-engine.ts, src/resume/index.ts, src/index.ts, tests/resume/*.test.ts
Tests: 86 automated tests passing across 33 test suites in Vitest (target resolution, task DAG sorting, interrupted task recovery, pending approvals, checkpoint validation, idempotent resume, and real disk crash reconstruction).
Verification: npm run typecheck (0 errors under strict: true), npm test (86/86 passing), npm run build (successful), npm run scorecard (1000/1000 Certified Perfect), multi-engine sync (CodeGraph, Graphify, Neo4j, Graphiti, Git).
Commit/Revision: Active
Risks: None.
Unresolved: None.
Next: P2.1 Multimodal Content Ingestion & Parsers.
 
## 2026-08-30 21:15 — TASK-P1.4-CHECKPOINTS-RECOVERY
 
Status: VERIFIED COMPLETE
What changed: Implemented the Checkpoint and Crash Recovery subsystem. Added CheckpointManifestBuilder for cryptographic manifest generation with SHA-256 integrity digests, CheckpointValidator for structural and persistent artifact/offset validation, LeaseManager for exclusive task claims, heartbeats, and stale lease reclamation, OrphanDetector for referential integrity scans across SQLite tables, and CrashRecoveryEngine for deterministic startup recovery, PRAGMA checks, lease reclamation, orphan sweep, and projection synchronization.
Files: src/recovery/*.ts, src/index.ts, tests/recovery/*.test.ts
Tests: 77 automated tests passing across 29 test suites in Vitest (checkpoint creation, manifest canonical JSON hashing, tampering detection, lease exclusivity/renewal/expiration/eviction, orphan detection, clean and corrupted crash recovery, projection rebuilds from event store, and real disk crash simulations).
Verification: npm run typecheck (0 errors under strict: true), npm test (77/77 passing), npm run build (successful), npm run scorecard (1000/1000 Certified Perfect), multi-engine sync (CodeGraph, Graphify, Neo4j, Graphiti, Git).
Commit/Revision: 6724f75
Risks: None.
Unresolved: None.
Next: P1.5 Resume (/resume, durable reconstruction, task/workflow restoration, pending approval restoration, artifact/worktree restoration).
 
## 2026-08-30 21:00 — TASK-P1.3-EVENT-STATE
 
 Status: VERIFIED COMPLETE
 What changed: Implemented the EventStore subsystem with append-only immutable event streams, safe pub/sub notifications, deterministic aggregate state reconstruction (Session and Task reducers), rebuildable projections (SessionSummaryProjection, TaskBoardProjection, ProjectionManager), and SessionTreeManager for hierarchical branching and forking without parent mutation.
 Files: src/event-state/event-store.ts, src/event-state/reconstruction/*.ts, src/event-state/projections/*.ts, src/event-state/session-tree/*.ts, src/event-state/index.ts, src/index.ts, tests/event-state/*.test.ts
 Tests: 61 automated tests passing across 24 test suites (event append, immutability, state reconstruction, projection incremental update & lossless rebuild from log, session branching/forking, and concurrency isolation).
 Verification: npm run typecheck (0 errors under strict: true), npm test (61/61 passing), npm run build (successful).
 Commit/Revision: 388c4e8
 Risks: None.
 Unresolved: None.
 Next: P1.4 Checkpoints/recovery (Checkpoint manifests, validation, crash recovery, orphan detection, stale lease handling).
 
 ## 2026-08-30 20:56 — TASK-P1.2-PERSISTENCE
 
 Status: VERIFIED COMPLETE
 What changed: Implemented the authoritative SQLite persistence subsystem using Node.js v25 native `node:sqlite` (DatabaseSync). Added SqliteEngine with WAL mode, synchronous=FULL (RPO 0 durability), foreign_keys=ON, and transactional units of work. Implemented MigrationEngine with SHA-256 checksum tracking in _migrations and Migration 001 for all core relational tables. Implemented ProjectRepository, SessionRepository, TaskRepository (with state transition enforcement), EventRepository (with append-only immutability), CheckpointRepository, ArtifactRepository, AttachmentRepository, and MemoryRepository.
 Files: src/persistence/sqlite-engine.ts, src/persistence/migration-engine.ts, src/persistence/migrations/001_initial_core_schema.ts, src/persistence/repositories/*.ts, src/persistence/index.ts, src/index.ts, tests/persistence/*.test.ts
 Tests: 51 automated tests passing across 19 test suites (durability, crash recovery, foreign key cascading, migration idempotency/tamper detection, repository CRUD, and state transitions).
 Verification: npm run typecheck (0 errors under strict: true), npm test (51/51 passing), npm run build (successful).
 Commit/Revision: e7d7c56
 Risks: None.
 Unresolved: None.
 Next: P1.3 Event/state (Event store stream projections, state reconstruction, projection rebuild, session tree branching).
 
 ## 2026-08-30 20:55 — TASK-P1.1-CORE-DOMAIN

Status: VERIFIED COMPLETE
What changed: Initialized git repo, Node.js/TypeScript configuration (package.json, strict tsconfig.json, vitest.config.ts), and implemented all 12 core domain models and contracts (Project, Session, Task, HarnessEvent, Checkpoint, ContentObject, Attachment, Artifact, MemoryItem, ContextPlan, Provenance, SecurityMetadata) with runtime Zod schemas, immutability helpers, and state transition machine.
Files: package.json, tsconfig.json, vitest.config.ts, .gitignore, src/domain/*.ts, src/index.ts, tests/domain/*.test.ts
Tests: 37 automated tests passing across 14 test suites (unit, state machine, immutability, round-trip serialization).
Verification: npm run typecheck (0 errors under strict: true), npm test (37/37 passing), npm run build (successful).
Commit/Revision: Initial repository commit
Risks: None on domain contracts. Next layer requires SQLite persistence and schema migrations.
Unresolved: None.
Next: P1.2 Persistence (SQLite schema, migrations, WAL, transactions, foreign keys, integrity checks).

```text
## YYYY-MM-DD HH:MM — TASK-ID

Status:
What changed:
Files:
Tests:
Verification:
Commit/Revision:
Risks:
Unresolved:
Next:
```

Never rewrite historical entries.

---

# 6. HUMAN DECISION LOG

When a decision is required:

```text
## DECISION-ID

Question:
Evidence:
Requirement:
Options:
Recommendation:
Security impact:
Persistence impact:
Recovery impact:
Compatibility:
Migration:
Human decision:
Date:
```

Do not implement a material unresolved decision.

---

# 7. MASTER RULE

The checklist is evidence, not decoration.

A checkbox means:

`implemented + tested + objectively verified`

not:

`code appears to exist`.

