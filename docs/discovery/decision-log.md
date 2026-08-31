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




