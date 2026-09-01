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

---

## ADR-014: Authoritative Workflow Execution Engine, Parallel Branching, Foreach, Budgets & Restart-Safe Approval Gates

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Executing complex multi-agent workflows requires an authoritative, durable execution engine that can coordinate DAG waves, parallel tasks, foreach collections, conditional routing, objective verification gates, external human approvals, hierarchical budgets, timeouts, retries, cancellation, and crash recovery. Crucially, model output is NEVER authoritative workflow state, and running workflows must survive process crashes and restarts without state loss or duplicate side effects.
- **Decision**: Implement the Workflow Execution Engine (`WorkflowEngine`, `WorkflowExecutor`, `WorkflowBudgetTracker`, `WorkflowRetryHandler`, `WorkflowRecoveryReconciler`):
  1. *Authoritative Wave Execution*: Evaluates DAG topological waves computed by `DAGEngine`. Dispatches ready nodes when upstream prerequisites are completed/skipped.
  2. *Parallel & Foreach Bounded Coordination*: Executes parallel branches with bounded concurrency (`maxParallelTasks`). Foreach collections are bounded (capped at max 50 items to prevent DoS) with deterministic per-item state tracking (`item_0`, `item_1`, ...) and aggregate state persistence.
  3. *Objective Verification Gates*: `verify` nodes execute deterministic AST expression assertions against actual outputs and exit codes, rejecting unproven model assertions.
  4. *Restart-Safe Approval Gates*: `approve` nodes transition the workflow run into `WAITING_APPROVAL` status, recording gate metadata and pausing execution. State is transactionally committed to SQLite WAL and survives process crashes. Resumption requires an authoritative call to `WorkflowEngine.approveGate()` with valid credentials.
  5. *Hierarchical Budgets & Bounded Retries*: `WorkflowBudgetTracker` enforces token, cost, duration, and concurrency limits (`effectiveLimit = min(workflow, agent, team, global)`). `WorkflowRetryHandler` classifies failures (`POLICY_DENIAL`, `INVALID_SCHEMA`, `RATE_LIMIT`, `TIMEOUT`, `NETWORK_ERROR`); non-retryable policy or schema denials fail closed immediately without retries, while transient errors retry with exponential backoff.
  6. *Crash Recovery & Reconciler*: `WorkflowRecoveryReconciler` scans uncompleted runs on process restart, reconciles orphaned running tasks, leaves `WAITING_APPROVAL` gates intact, and preserves complete audit trails in the append-only `EventStore`.
- **Consequences**: Zero loss of workflow state across process crashes, zero unconstrained runaway foreach loops, strict enforcement of human approval authority, full budget containment, and complete RPO-0 ACID durability.

---

## ADR-015: Background Tasks, Long-Running Jobs, Worker Ownership & Generation-Fenced Lease Heartbeats

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Asynchronous, detached agent workloads require background execution capabilities that operate independently of interactive client connections while guaranteeing durable ownership, heartbeats, cancellation, timeout enforcement, bounded concurrency, crash recovery, and protection against split-brain zombie writes.
- **Decision**: Implement the Background Job Subsystem (`src/domain/job.ts`, `src/persistence/migrations/007_background_jobs.ts`, `JobRepository`, `BackgroundJobManager`, `BackgroundJobSupervisor`, `BackgroundJobRecoveryReconciler`):
  1. *Durable Job Contract & State Machine*: 13-state authoritative state machine (`CREATED`, `QUEUED`, `CLAIMING`, `RUNNING`, `PAUSED`, `CANCEL_REQUESTED`, `CANCELLED`, `COMPLETING`, `COMPLETED`, `FAILED`, `TIMED_OUT`, `ORPHANED`, `RECOVERY_REQUIRED`).
  2. *Worker Ownership & Monotonic Fencing*: Integrates with `TaskClaimManager` and `LeaseRepository`. Every claim produces an exclusive lease with a monotonic `generation` token. Any stale worker presenting an outdated generation token on heartbeats, checkpoints, or completion is rejected with `FENCING_VIOLATION`.
  3. *Durable Heartbeat Protocol*: Validates worker identity, lease ID, and generation token, with bounded renewal limits. Execution deadlines are strictly enforced during heartbeats.
  4. *Durable Cancellation Cascades*: Cancellation is an ACID state transition committed to SQLite WAL immediately (`CANCELLED`), notifying active workers and releasing leases.
  5. *Detached Supervisor Worker Pool*: `BackgroundJobSupervisor` manages asynchronous execution loops, automated heartbeats, deadline supervision, and project-level concurrency limits.
  6. *Post-Crash Recovery & Orphan Reconciler*: `BackgroundJobRecoveryReconciler` scans uncompleted jobs on startup, cleans up orphaned leases, preserves checkpoint progress, and prepares jobs for restart.
  7. *Classified Bounded Retries*: Reuses `WorkflowRetryHandler` to retry transient failures with exponential backoff while failing closed immediately on non-retryable policy or schema denials.
- **Consequences**: Zero loss of background task state across process crashes, strict protection against zombie worker overwrites via generation fencing, full budget containment, and complete RPO-0 ACID durability.

---

## ADR-016: Remote Agents, Multi-Node Execution, Generation Fencing & Split-Brain Prevention

- **Status**: `ACCEPTED`
- **Date**: 2026-08-31
- **Context**: Scaling agent workloads across multiple nodes requires distributed task dispatch, node registration, capability matching, and remote execution without compromising security boundaries, budget limits, or allowing split-brain zombie writes.
- **Decision**: Implement the Remote Agent & Multi-Node Execution Subsystem (`src/domain/node.ts`, `src/persistence/migrations/008_remote_nodes_dispatch.ts`, `NodeRepository`, `RemoteDispatchRepository`, `NodeRegistry`, `RemoteAuthVerifier`, `RemoteDispatchManager`, `RemoteNodeClient`, `RemoteRecoveryReconciler`):
  1. *Zero Authority Delegation*: Remote placement is an execution location, NOT a permission authority. Remote nodes cannot alter permissions, capabilities, or bypass `ToolGateway` / `PolicyEngine`.
  2. *Controller as Authoritative State Authority*: All state mutations are committed to SQLite on the controller with WAL mode and `synchronous = FULL`. Remote worker output is treated as untrusted data until verified.
  3. *Monotonic Generation Fencing*: Every remote dispatch carries an exclusive lease and generation token ($g_n$). Partitioned or stale workers attempting late heartbeats, completions, or checkpoints after controller reclamation ($g_n < g_{n+1}$) are strictly rejected with `FENCING_VIOLATION` / `SPLIT_BRAIN_REJECTED`.
  4. *Idempotent Dispatches*: Dispatches carry `dispatchId` and `idempotencyKey` to guarantee *effectively-once* state transitions over *at-least-once* network transports.
  5. *7-Step Remote Result Acceptance*: Enforces schema validation, HMAC signature authentication, project scope verification, generation fencing, task status validation, artifact hash verification, and transactional commit.
  6. *Post-Crash & Partition Reconciler*: `RemoteRecoveryReconciler` cleans up orphaned leases and reconciles active dispatches across controller crashes or network partitions.
- **Consequences**: Zero split-brain data corruption across partitions, zero privilege escalation on remote workers, robust idempotent deduplication, and complete RPO-0 ACID durability.

---

## ADR-017: CLI Foundation, Interactive Session Loop, Command Routing & Tenant Isolation

- **Status**: `ACCEPTED`
- **Date**: 2026-09-01
- **Context**: An interactive terminal and scripted command-line interface is required to operate Anantham V2. The CLI must function strictly as an interface, delegating all operations to existing runtime services while preserving system invariants, tenant isolation boundaries, secret protection, error classifications, and durable signal handling.
- **Decision**: Implement the CLI Subsystem (`src/domain/cli.ts`, `CommandParser`, `OutputRenderer`, `CliErrorHandler`, `SessionController`, `SignalHandler`, `CommandRegistry`, `InteractiveSessionLoop`, `CliApplication`, `bin/anantham.ts`):
  1. *Interface Boundary Invariant*: The CLI does not implement custom persistence, policy, scheduling, or execution logic. It delegates strictly to `ProjectRepository`, `SessionRepository`, `TaskRepository`, `TaskClaimManager`, `SessionResumeEngine`, `CrashRecoveryEngine`, `PolicyEngine`, and `ToolRegistry`.
  2. *Command Tokenizer & Injection Defense*: Safe tokenization supporting quotes, flags, and negative numbers without shell string concatenation or raw `child_process.exec`.
  3. *Session Controller & Tenant Boundary*: Active project and session context are maintained in `SessionController`. Switching or accessing sessions across project boundaries is strictly rejected.
  4. *Structured Output & Automated Redaction*: Supports `text`, `json`, and `jsonl` output modes with recursive secret/credential key masking.
  5. *Classified Error Preservations*: Error messages preserve runtime classification categories (`POLICY_DENIAL`, `PERMISSION_DENIED`, `VALIDATION_ERROR`, `NOT_FOUND`, `LEASE_FENCING_ERROR`, `PERSISTENCE_ERROR`, `RECOVERY_ERROR`, `USER_CANCELLATION`).
  6. *Durable Signal Dispatcher*: SIGINT/SIGTERM trigger cooperative runtime cancellation callbacks rather than abrupt process termination.
- **Consequences**: Pure interface separation, zero business logic duplication, robust cross-tenant isolation, safe headless and interactive scriptability, and full RPO-0 ACID durability.

---

## ADR-018: TUI Presentation Layer, Real-Time Projection Adapters & Terminal Security

- **Status**: `ACCEPTED`
- **Date**: 2026-09-01
- **Context**: A full terminal user interface (TUI) is required for real-time visualization of sessions, tasks, workflows, background jobs, remote nodes, agents, approvals, and canonical event streams. The TUI must remain strictly a presentation layer without becoming a second persistence, event store, task scheduler, workflow engine, or recovery system.
- **Decision**: Implement the TUI Subsystem (`src/domain/tui.ts`, `TuiSanitizer`, `TerminalLayout`, `TuiStateAdapter`, `TuiRenderer`, `TuiController`, `TuiApplication`, `bin/anantham.ts --tui`):
  1. *Presentation Layer Invariant*: The TUI consumes authoritative state and rebuildable derived projections (`TaskBoardProjection`, `SessionSummaryProjection`). It maintains ephemeral in-memory view models and never writes directly to SQLite or alters leases.
  2. *Real-Time Event Adapter*: `TuiStateAdapter` subscribes to `EventStore` with strict error isolation so subscriber exceptions never break authoritative transactions.
  3. *9 Core Visual Views*: Dashboard, Session hierarchy, Kanban Task Board (with leases & generation tokens), Workflow DAG runs, Agent directory, Background jobs, Remote nodes, Pending approvals, and Live Event Log.
  4. *Terminal Escape Injection Defense*: `TuiSanitizer` strips ANSI escape codes, OSC sequences, and dangerous control characters from all untrusted runtime strings.
  5. *Automated Secret Redaction*: Recursive masking of passwords, tokens, credentials, and API keys.
  6. *Render Coalescing & Backpressure*: Debounces high-frequency event bursts to prevent render storms and CPU saturation.
  7. *Command Bridge*: Integrates directly with `CommandRegistry` for slash command execution from the TUI command bar.
- **Consequences**: Pure presentation decoupling, robust terminal security, zero event transaction interference, and full RPO-0 ACID durability.

---

## ADR-019: Programmatic Runtime Access, REST API Subsystem, OpenAPI 3.1 & Typed Client SDK

- **Status**: `ACCEPTED`
- **Date**: 2026-09-01
- **Context**: External services, programmatic pipelines, and developer tooling require structured HTTP access to Anantham V2. The API layer must strictly remain an interface/adaptation boundary without duplicating business logic, competing with existing runtime engines, or violating project tenant isolation.
- **Decision**: Implement the API & SDK Subsystems (`src/domain/api.ts`, `ApiAuthenticator`, `ApiAuthorizer`, `ApiErrorMapper`, `ApiIdempotencyManager`, `ApiRouter`, `ApiServer`, `OpenApiGenerator`, `AnanthamClient`, `bin/anantham.ts --server`):
  1. *Interface Boundary Invariant*: The API delegates all authoritative actions to existing runtime services (`ProjectRepository`, `SessionRepository`, `TaskClaimManager`, `JobRepository`, `EventStore`, `NodeRepository`, `CrashRecoveryEngine`).
  2. *Authentication & Project Tenant Isolation*: `ApiAuthenticator` validates Bearer tokens/API keys; `ApiAuthorizer` enforces tenant containment, strictly preventing cross-project resource access (`403 Forbidden`).
  3. *Idempotency & Deduplication*: Mutating endpoints check `Idempotency-Key` headers via `ApiIdempotencyManager` to prevent duplicate side effects on retries.
  4. *Error Classification*: Maps runtime exceptions to standard HTTP status codes and structured classification codes (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `LEASE_FENCING_ERROR`, `INTERNAL_ERROR`).
  5. *OpenAPI 3.1 & Typed SDK Parity*: `OpenApiGenerator` outputs valid OpenAPI 3.1.0 specifications; `AnanthamClient` provides typed promises, automatic authentication, error unrolling (`AnanthamApiError`), and pagination helpers.
- **Consequences**: Pure interface decoupling, robust tenant containment, zero business logic drift, high-performance programmatic access, and full RPO-0 ACID durability.

---

## ADR-020: External Integrations, Inbound HMAC Webhooks, Durable Outbound Dispatch & CI/CD/IDE Adapters

- **Status**: `ACCEPTED`
- **Date**: 2026-09-01
- **Context**: External systems (GitHub, GitLab, Slack, IDEs, CI/CD runners) require bidirectional integration with Anantham V2. The integration boundary must strictly treat external payloads as untrusted data without establishing a second persistence authority, scheduler, or policy bypass.
- **Decision**: Implement the Integrations Subsystem (`src/domain/integration.ts`, SQLite migration 009, `IntegrationRepository`, `WebhookSubscriptionRepository`, `WebhookDeliveryRepository`, `WebhookIngestionEngine`, `WebhookDispatcher`, `CicdAdapter`, `IdeAdapter`, `IntegrationManager`):
  1. *Adapters Not Authorities*: Integrations adapt external formats into canonical domain contracts and delegate all actions to existing runtime engines. External systems cannot directly execute commands or bypass `PolicyEngine` / `ToolGateway`.
  2. *Inbound Cryptographic HMAC Verification*: Inbound webhooks require timing-safe HMAC-SHA256 signature verification against secret references before accepting payload.
  3. *Replay Protection & Idempotency*: Duplicate deliveries are rejected via persistent delivery ID checks in SQLite WAL.
  4. *Durable Outbound Delivery & Classified Retries*: Outbound webhooks persist `WebhookDeliveryRecord` before dispatch, sign payloads with `X-Anantham-Signature`, and employ exponential backoff retries with transient (5xx, 429) vs permanent (4xx) failure classification.
  5. *Project Tenant Containment*: Enforces strict project boundaries, ensuring events from Project A cannot be dispatched to Project B webhooks or accessed by Project B integrations.
- **Consequences**: Robust integration security, zero untrusted execution, reliable delivery guarantees across restarts, and full RPO-0 durability.

---

## ADR-021: Security, Governance, Tamper-Evident Audit Logging & Telemetry Engine

- **Status**: `ACCEPTED`
- **Date**: 2026-09-01
- **Context**: Anantham V2 requires verifiable security evidence, structured operational telemetry, and compliance reporting. Observability must strictly observe without granting authority, influencing policy decisions, or leaking secrets.
- **Decision**: Implement the Observability Subsystem (`src/domain/observability.ts`, `AuditLogger`, `SecurityEventClassifier`, `TelemetryEngine`, `DiagnosticInspector`, `ComplianceExporter`, `ObservabilityManager`):
  1. *Observability is Not Authority*: Observability tools never grant permissions or alter policy evaluations. `PolicyEngine` and `ToolGateway` remain authoritative.
  2. *Cryptographic SHA-256 Chaining & Tamper Evidence*: `AuditLogger` constructs a linked digest chain linking each audit record to its predecessor. Historical tamper detection is verifiable via `AuditLogger.verifyChain()`.
  3. *Deterministic Security Event Classification*: `SecurityEventClassifier` standardizes classification across policy denials, prompt injections, signature failures, and tenant violations.
  4. *Correlation & Causality Lineage*: Every audit record preserves `correlationId`, `parentEventId`, `causationId`, `actor`, and `projectId`.
  5. *Secret-Safe Sanitization*: Automated recursive scrubbing ensures raw API keys, bearer tokens, and credentials never enter audit digests or telemetry.
  6. *Machine-Verifiable Compliance Bundles*: `ComplianceExporter` produces cryptographically signed compliance audit reports for external auditing.
- **Consequences**: Provable audit integrity, zero credential leakage, robust system diagnostics, and full compliance readiness.

---

## ADR-022: Benchmark Datasets, Scenarios & Evaluation Harness

- **Status**: `ACCEPTED`
- **Date**: 2026-09-01
- **Context**: Anantham V2 requires a rigorous, objective evaluation harness to measure agentic execution, tool use, workflows, background jobs, lease fencing, crash recovery, prompt injection defense, secret redaction, and project isolation without relying on model self-report.
- **Decision**: Implement the Evaluation Subsystem (`src/domain/evaluation.ts`, SQLite Migration 010, `EvaluationRepository`, `BenchmarkRegistry`, `AssertionEvaluator`, `EvidenceCollector`, `RegressionEngine`, `EvaluationHarness`, `EvaluationManager`):
  1. *Model Output is NOT Evidence*: Model claims of completion are never accepted as proof. The harness validates authoritative SQLite rows, immutable EventStore events, artifact hashes, and process exit codes.
  2. *Evaluation is NOT Authority*: The evaluation harness strictly observes and measures runtime behavior. It never bypasses `PolicyEngine`, `ToolGateway`, `TaskClaimManager`, `WorkflowEngine`, or project tenant boundaries.
  3. *Immutable Versioned Benchmarks*: Standard benchmark suites (`dataset_core_v1`, `dataset_security_v1`, `dataset_recovery_v1`) provide deterministic testing across difficulty levels.
  4. *Objective Machine-Verifiable Assertions*: Evaluates `STATE_EQUALS`, `EVENT_EXISTS`, `ARTIFACT_EXISTS`, `POLICY_DECISION`, `TOOL_COUNT_LIMIT`, `RESOURCE_LIMIT`, `SECRET_ABSENT`, `PROJECT_CONTAINMENT`, and `RECOVERY_SURVIVED`.
  5. *Isolated Execution Context*: Each evaluation run executes inside dedicated temporary projects and sessions, ensuring zero pollution of production or user workspaces.
  6. *Durable Evaluation Records*: SQLite Migration 010 persists `eval_runs` and `eval_case_results` transactionally.
  7. *Regression Detection*: `RegressionEngine` computes score deltas, new failures, and fixed failures against prior baseline runs.
- **Consequences**: Objective, reproducible verification across runtime updates, provable defense against regressions, and complete benchmark traceability.

---

## ADR-023: Recovery, Chaos, Interruption & Durability Evaluation

- **Status**: `ACCEPTED`
- **Date**: 2026-09-01
- **Context**: The pre-flight adversarial architecture audit revealed that prior crash recovery assumptions suffered from three critical vulnerabilities: in-memory disconnected recovery lease management, permanent task stagnation when in-progress tasks were interrupted, and mock-based assertion evaluation that bypassed physical database state.
- **Decision**: Harden recovery and evaluation systems across Anantham V2:
  1. *Persistent SQLite Lease Reclamation*: `CrashRecoveryEngine` queries the authoritative `leases` table directly and transitions expired rows to `EXPIRED` status on engine startup.
  2. *Interrupted In-Progress Task Sweep*: `CrashRecoveryEngine` sweeps orphaned tasks stuck in `running`, `claimed`, or `verifying` state with expired or missing active leases and resets them to `queued`, allowing subsequent workers to claim them with incremented generation tokens.
  3. *Physical Database & Filesystem Assertion Verification*: `AssertionEvaluator` executes real physical SQL checks (`PRAGMA integrity_check`, referential constraints, disk digests) rather than relying on in-memory dictionary flags.
  4. *Idempotent Repeated Recovery*: Verified that consecutive crash-recovery cycles (`Crash -> Recovery -> Crash -> Recovery`) execute without duplicating tasks, leases, or corrupting state.
- **Consequences**: Real crash resilience, guaranteed un-jamming of crashed tasks, hardened generation fencing, and tamper-resistant objective evaluation metrics.










