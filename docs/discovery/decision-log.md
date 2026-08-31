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

---

## ADR-005: Model Context Protocol (MCP) Adapter & Zero Policy Bypass Architecture

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: External tools, resources, and prompt templates from Model Context Protocol (MCP) servers must be ingested safely without introducing alternative execution pathways or bypassing security gates.
- **Decision**: Treat MCP strictly as an external integration adapter layer over existing Anantham infrastructure (`ToolGateway`, `PolicyEngine`, `ContentEngine`, `EventStore`). Normalize discovered MCP tools into `ToolDefinition` contracts registered in `ToolRegistry` behind `ToolGateway`, normalize discovered MCP resources into `ContentObject` pipelines with `Provenance` and `ContentGuards`, enforce non-authoritative boundary on MCP prompt templates (`isAuthoritative: false`), and protect the runtime using a 3-state `MCPCircuitBreaker` and `MCPOutputSanitizer`.
- **Consequences**: Zero policy bypass, complete auditability via SQLite WAL `EventStore`, prompt injection defense, and resilience against external server failures.

---

## ADR-006: Plugin Extension Runtime, Scoped Permissions & Zero-Stale-Registration Lifecycle

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Plugins provide third-party and custom extensibility (tools, skills, providers, hooks, commands, MCP adapters) but must not become alternative authorities, self-promote trust, bypass system policies, or leave stale registrations upon unload.
- **Decision**: Plugins are classified strictly as extensions (`PluginClass`). Manifests request permissions and capabilities; runtime `PolicyEngine` and `PluginTrustManager` retain sole authority. Manifests require SemVer compliance, SHA-256 package checksum verification, and compatibility checks (OS, Node, Anantham runtime). The `PluginManager` implements a strict lifecycle state machine (`discovered -> inspected -> validated -> resolved -> reviewed -> installed -> active`). Disabling or unloading a plugin synchronously invalidates and unregisters all tools and hooks from active registries. State migrations are managed with deterministic version step chains.
- **Consequences**: Zero stale registrations, strict supply-chain security, failure isolation, and project-level version lock stability.

---

## ADR-007: Skill Procedural Knowledge, Progressive Loading & Untrusted Boundary Architecture

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Skills provide procedural guidance (*"How should this task be performed?"*) in contrast to Memory (*"What is known?"*). However, arbitrary skill markdown files must not be treated as executable code or security authorities, must not bypass `ToolGateway`, and must not overwhelm token budgets with eager startup loading.
- **Decision**: Skills are defined strictly as data/procedural guidance parsed from `SKILL.md` (YAML frontmatter + Markdown body). Enforce a 3-phase progressive disclosure pipeline: (1) cheap metadata indexing at startup, (2) BM25/tag relevance matching against task goals, and (3) token-budgeted full procedure injection into `ContextPlan`. All required tools and MCP dependencies are resolved against `ToolRegistry` and `MCPRegistry`; missing dependencies prevent activation rather than executing with partial unknown capability. Untrusted skill content is wrapped with non-authoritative boundary tags, and prompt injection attempts are rejected by `SkillSecurityGuard`. Project-level skill version pinning and SQLite WAL audit durability are strictly enforced.
- **Consequences**: Zero token bloat at startup, full prompt injection defense, strict ToolGateway enforcement, and deterministic skill execution provenance.

---

## ADR-008: Hook Deterministic Lifecycle Automation & Zero Bypass Architecture

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Lifecycle triggers (e.g. `BeforeTool`, `AfterTool`, `BeforeCommand`, `BeforePush`, `BeforeDeploy`) require deterministic runtime automation, but arbitrary hook actions must not bypass `ToolGateway`, `PolicyEngine`, approval gates, or cause infinite recursion loops.
- **Decision**: Hooks are implemented as deterministic runtime automation (`HookManifestSchema`, `HookRecordSchema`, `HookRegistry`, `HookMatcher`). All capability actions declared by hooks route strictly through `ToolGateway` (never direct `child_process.exec()`). Recursion and cyclic cascade protection is enforced by `HookRecursionGuard` (`depth <= 5`, `maxFanOut <= 20`, causation chain cycle checks). Hooks declare explicit error policies: `fail-closed` (blocks the triggering operation on failure), `fail-open` (logs warning, proceeds), and `warn`. All hook lifecycle transitions emit durable audit events to the SQLite WAL `EventStore`.
- **Consequences**: Deterministic lifecycle automation, zero security policy bypass, complete recursion protection, and durable auditability.

---

## ADR-009: Agent Identity, 10-Step Deterministic Startup Resolution & Pre-Execution Safety

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: An Agent represents a bounded execution identity. In order to avoid runtime crashes, privilege escalations, or model-capability mismatch during execution, all requirements (Model, Capability, Tool, Skill, Permission, Executor, Budget, Context, and Memory) must be verified and resolved into an immutable blueprint before an agent is allowed to start.
- **Decision**: Agents are defined by declarative manifests (`AgentManifestSchema`). An Agent never starts in an unresolved state. The `AgentStartupResolver` executes a deterministic 10-step resolution pipeline: (1) security/prompt injection validation, (2) model & provider routing, (3) tool verification against `ToolRegistry`, (4) skill verification against `SkillRegistry`, (5) permission resolution against `PolicyEngine`, (6) executor profile resolution, (7) budget and resource boundary calculation, (8) context token & path scoping, (9) memory namespace isolation, and (10) emission of an immutable `AgentStartupPlan`. Running instances pin this immutable plan to preserve execution stability across hot reloads. All lifecycle events are committed to the SQLite WAL `EventStore`.
- **Consequences**: Zero start-in-unresolved-state risks, complete anti-self-promotion protection, deterministic execution provenance, and active-run configuration pinning.

---

## ADR-010: Task Board, Atomic Claims, Durable Leases, Ownership Fencing & Stalled-Agent Recovery

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Autonomous multi-agent coordination requires a concurrency-safe, crash-resilient mechanism for discovering eligible tasks, claiming tasks without race conditions, maintaining liveness leases, and recovering stalled tasks. Task ownership must never be based on model assertions.
- **Decision**: Implement a durable Task Board, Claim, and Lease subsystem (`TaskBoard`, `TaskClaimManager`, `StalledAgentRecoveryEngine`, `LeaseRepository` in SQLite). All claims execute in single SQLite ACID transactions. Every lease has a strictly monotonic `generation` fencing token; mutations and heartbeats from stale or reclaimed owners are rejected with `FENCING_VIOLATION`. Heartbeats extend leases up to bounded max renewals. Stalled agents are swept and classified (`AGENT_CRASHED`, `HEARTBEAT_TIMEOUT`, `MAX_DURATION_EXCEEDED`) and tasks are reclaimed for bounded retries (default: 3) or failed deterministically. All transitions are recorded in the append-only SQLite WAL `EventStore`.
- **Consequences**: Zero double-claims, zero split-brain/zombie writes, deterministic failure recovery, RPO-0 durability, and complete project isolation.

---

## ADR-011: Subagents, Team Definition, Roles, Topologies & Handoff Communication

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Multi-agent coordination requires explicit runtime concepts for parent/child delegation, team definitions, role topologies, peer messaging, and structured handoffs. Delegation must prevent uncontrolled recursive spawning and privilege escalation. Handoffs must be authoritative state transitions rather than prompt transcripts.
- **Decision**: Implement subagent delegation and team runtime (`SubagentManager`, `DelegationGuard`, `TeamManager`, `TeamTopologyEvaluator`, `PeerMessenger`, `AgentHandoffManager`, `TeamRepository`, `PeerMessageRepository`, `HandoffRepository`). Subagents are strictly bounded: delegation depth $\le 4$, active children per agent $\le 8$, budget strictly contained within parent limits, and child granted permissions must be a subset of parent permissions ($\mathcal{P}_{child} \subseteq \mathcal{P}_{parent}$). Teams have versioned definitions, explicit roles (`coordinator`, `planner`, `implementer`, `reviewer`, `verifier`, `specialist`), and topology-enforced communication (`coordinator_workers`, `pipeline`, `peer_to_peer`, `specialist_pool`). Peer messages validate membership and topology rules, utilizing Artifact references instead of large transcript dumps. Handoffs atomically transfer task leases via SQLite transactions, incrementing the monotonic generation fencing token to fence previous owners. All coordination events are committed to the SQLite WAL `EventStore`.
- **Consequences**: Controlled bounded subagent spawning, zero privilege escalation, topology-enforced communication safety, authoritative atomic task ownership transfers, artifact-first information exchange, and complete crash/restart recoverability.
---

## ADR-012: Parallel Execution, Git Worktree Isolation, Deterministic Conflict Detection & Quarantine Recovery

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Concurrent multi-agent execution requires strong filesystem and working tree isolation to prevent agents from corrupting shared source repositories, overwriting uncommitted user work, or attempting unsafe concurrent git merges.
- **Decision**: Implement parallel execution runtime rooted in Git worktree isolation and task lease ownership (`GitWorktreeManager`, `ChangeSetCalculator`, `ConflictDetector`, `WorkspaceManager`, `WorkspaceIntegrator`, `ParallelOrchestrator`, `WorkspaceRecoveryEngine`, `WorkspaceRepository`). Workspace allocation requires valid task claims and leases (`taskId + leaseId + generation + agentId + instanceId + projectId`). Each workspace is allocated an isolated git worktree branch under `.anantham/worktrees/<workspaceId>` with strict path traversal defenses. Changesets calculate SHA-256 file hashes, diff patches, and symbol modifications across architectural domains. Conflict detection deterministically classifies overlaps across 12 categories (`USER_CHANGE_CONFLICT`, `BASE_DIVERGENCE`, `FILE_CONFLICT`, `DELETE_MODIFY_CONFLICT`, `RENAME_CONFLICT`, `ADD_ADD_CONFLICT`, `CONTRACT_CONFLICT`, `MIGRATION_CONFLICT`, `EVENT_SCHEMA_CONFLICT`, `PUBLIC_API_CONFLICT`, `NO_CONFLICT`, `UNKNOWN_CONFLICT`). If uncommitted user modifications exist on target branch, integration fails closed (`USER_CHANGE_BLOCKED`). When conflicts occur, `ParallelOrchestrator` provides deterministic serialization fallback via rebase on top of the integrated target commit. Crashed or abandoned workspaces preserve dirty work into durable `WorkspaceQuarantineRecord` patch artifacts rather than deleting evidence. All state is transactionally persisted in SQLite migration `005_workspaces_parallel.ts` and audited in the append-only `EventStore`.
- **Consequences**: Zero user-work overwrites, zero repository corruption, deterministic conflict detection and serialization fallback, robust evidence preservation for crashed workers, and RPO-0 durability.
## ADR-013: Workflow as Code, Fluent DSL, Deterministic DAG Engine, Cycle Prevention & Active-Run Version Pinning

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Orchestrating multi-agent pipelines requires an expressive, type-safe, declarative Workflow as Code representation. To prevent unrecoverable runtime deadlocks, infinite loops, silent configuration drift during active executions, and arbitrary code injection, the workflow engine must support compile-time/parse-time DAG validation, cycle detection, safe AST condition evaluation without dynamic `eval()`, scoped resolution with precedence, and immutable active-run version pinning.
- **Decision**: Implement the Workflow as Code subsystem (`src/workflow/` and `src/domain/workflow.ts`):
  1. *Workflow Contracts & DSL*: Fluent TypeScript primitives (`defineWorkflow()`, `task()`, `parallel()`, `foreach()`, `verify()`, `approve()`) generating type-safe, validated workflow definitions backed by Zod schemas (`WorkflowDefinitionSchema`, `WorkflowTaskNodeSchema`, `WorkflowParallelNodeSchema`, `WorkflowForeachNodeSchema`, `WorkflowVerifyNodeSchema`, `WorkflowApproveNodeSchema`, `WorkflowRunSchema`).
  2. *Deterministic DAG Engine*: Implements Kahn's topological sorting algorithm (`DAGEngine`) to partition task graphs into parallel execution waves and detect circular deadlocks (`A -> B -> C -> A`, `A -> A`) before runtime execution, rejecting invalid manifests with clear diagnostics.
  3. *Safe Condition Evaluator*: Deterministic AST expression and predicate evaluator (`ConditionEvaluator`) supporting boolean operators, artifact presence, and task status checks without `eval()`, `new Function()`, or prototype pollution vulnerability.
  4. *Scoped Registry & Precedence*: `WorkflowRegistry` resolves workflows according to strict precedence: `project > profile > global > built-in` (PRD Part 2 Section 111).
  5. *Active-Run Version Pinning*: Active runs freeze an immutable snapshot (`PinnedVersions`) of workflow version, plugin versions, skill versions, agent versions, and model profiles (PRD Part 2 Section 112).
  6. *SQLite Durability & Event Sourcing*: Workflows and execution run states persist to SQLite in WAL mode via migration `006_workflows_orchestration.ts` and emit canonical audit events (`workflow.registered`, `workflow.started`, etc.) to `EventStore`.
- **Consequences**: Zero circular deadlocks, zero untrusted code execution in workflow logic, robust active-run stability against hot reload drift, scope resolution precedence enforcement, and full RPO-0 durability.
