# Active Tasks Registry — Anantham V2

This document tracks active, blocked, and recently completed sprint tasks. It is synchronized after task completion events to preserve operational awareness across sessions.

---

## 1. Active Phase Backlog (P6 — Agents / Teams / Parallel Execution)

### [P6.1 — Agent Identity, Configuration & Startup Resolution](file:///C:/herness/docs/discovery/current-state.md#L10)
- **Status**: `READY_FOR_EXECUTION`
- **Owner**: Principal Multi-Agent & Orchestration Architect
- **Description**: Implement first-class Agent runtime: agent identity/configuration, startup capability/policy resolution, budget enforcement, task board integration, task claims, leases, heartbeats, and stalled-agent recovery.
- **Dependencies**: `P1.1–P1.5`, `P2.1–P2.6`, `P3.1–P3.5`, `P4.1–P4.5`, `P5.1–P5.4`.

---

## 2. Completed Milestones (Recent)

### [TASK-P5.4-HOOKS — Lifecycle Engine & Deterministic Automation](file:///C:/herness/src/hooks/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Lifecycle & Automation Architect
- **Completed Date**: 2026-08-31
- **Verification**: 441/441 tests passing across 198 test suites in Vitest. First-class Hook Runtime: HookTriggerTypeSchema (22 lifecycle events), HookActionSchema, HookPolicySchema (fail-closed, fail-open, warn), HookManifestSchema, HookRecordSchema, HookRegistry (global/project scoping), HookMatcher (deterministic priority & ID sorting, toolName/pathPattern/payload filters), HookRecursionGuard (depth <= 5, causation cycle detection, fan-out limits), HookSecurityGuard (prompt injection defense, dangerous shell command filtering), HookExecutor (ToolGateway routing, timeouts, bounded retries), HookTestRunner (fixture testing /hooks test), and SQLite WAL EventStore audit durability.

### [TASK-P5.3-SKILLS — Procedural Knowledge & Skill Engine](file:///C:/herness/src/skills/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Agent & Skills Architect
- **Completed Date**: 2026-08-31
- **Verification**: 422/422 tests passing across 188 test suites in Vitest. First-class Skill Runtime: SkillFrontmatterSchema, SkillMetadataSchema, SkillProcedureSchema, SkillManifestSchema, SkillParser (SKILL.md parsing), SkillCompatibilityChecker (model capabilities, runtime), SkillDependencyResolver (required tools, MCP, sub-skills, cycle detection), SkillRelevanceMatcher (BM25 keyword/tag scoring), SkillProgressiveLoader (3-phase progressive disclosure & token budgeting), SkillTestRunner (deterministic fixtures /skills test), SkillRegistry (project-level version locks), SkillManager (lifecycle state machine: discover, install, enable, disable, reload, remove, execute, test), SkillSecurityGuard (prompt injection defense & non-authoritative boundary wrapping), and SQLite WAL EventStore audit durability.

### [TASK-P5.2-PLUGINS — Plugin Extension Runtime](file:///C:/herness/src/plugins/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Extensibility & Systems Architect
- **Completed Date**: 2026-08-31
- **Verification**: 401/401 tests passing across 178 test suites in Vitest. First-class Plugin Runtime: PluginManifestSchema, SemVer validation, SHA-256 package verification, PluginCompatibilityChecker (OS/Node/Runtime), PluginDependencyResolver (topological sort, cycle detection), PluginPermissionsManager (network, filesystem, credentials, tools, subprocess review), PluginTrustManager (deterministic transitions, anti-self-promotion), PluginInstaller (staged atomic install with rollback), PluginManager (lifecycle state machine: discover, install, activate, disable, unload, reload, update, rollback), PluginRegistry (project-level version pinning), PluginStateManager (versioned migrations), PluginDoctor (/plugins doctor diagnostics), and SQLite WAL EventStore audit durability.

### [TASK-P5.1-MCP — Model Context Protocol (MCP) Integration Plane](file:///C:/herness/src/mcp/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Protocol & Integration Architect
- **Completed Date**: 2026-08-31
- **Verification**: 377/377 tests passing across 168 test suites in Vitest. First-class Model Context Protocol (MCP) integration plane: MCPRegistry (server management, client caching, project isolation), MCPClient (connect, initialize, ping, tool calling, resource reading, prompt retrieval, graceful disconnect), MCPCircuitBreaker (deterministic 3-state resilience), MCPToolNormalizer (ToolDefinition translation with prototype pollution defenses), MCPResourceNormalizer (ContentObject normalization with SHA-256 provenance), MCPPromptManager (non-authoritative prompt templates), MCPOutputSanitizer (secret scrubbing, byte truncation), and full ToolGateway enforcement.

### [TASK-P4.5-SIDE-EFFECTS — Side Effects & Retry Plane](file:///C:/herness/src/side-effects/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Reliability & Fault-Tolerance Architect
- **Completed Date**: 2026-08-31
- **Verification**: 355/355 tests passing across 158 test suites in Vitest. First-class Side Effects plane: SideEffectClassifier (read_only, idempotent_write, reversible_write, non_idempotent_write, unknown), RetryDecisionEngine (deterministic evaluation, non-retryable rejection, approval expiry check, UNKNOWN != RETRYABLE safety), RetryBudgetManager (hierarchical multi-layer global/task/operation budgets preventing retry multiplication), FileDivergenceDetector (base hash vs current disk hash verification, preventing user change overwrites), WorktreeDivergenceDetector (git working tree inspection and destructive reset guards), SideEffectJournal (audit tracking and immutable SQLite EventStore durability).

### [TASK-P4.4-EXECUTORS — Execution Infrastructure Plane](file:///C:/herness/src/execution/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Runtime & Systems Architect
- **Completed Date**: 2026-08-31
- **Verification**: 325/325 tests passing across 148 test suites in Vitest. First-class execution infrastructure behind ToolGateway & Native Tools: LocalExecutor (bounded cwd containment, env whitelist, secret scrubbing, output truncation), DockerSandboxExecutor (mount containment, privilege drops, network policy, deterministic fail-closed unavailability), RemoteExecutor (interface and unconfigured handling), ProcessSupervisor (lifecycle state machine, active handle tracking, process tree termination, and SQLite EventStore audit durability).

### [TASK-P4.3-NATIVE-TOOLS — Native Tools Suite](file:///C:/herness/src/tools/native/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Tool & Systems Architect
- **Completed Date**: 2026-08-31
- **Verification**: 306/306 tests passing across 138 test suites in Vitest. First-class Native Tools suite behind ToolGateway: Filesystem (read_file, write_file, list_dir, file_stat, delete_file), Search (search_text, find_files), Process/Shell (run_command), Git (git_status, git_diff, git_log, git_commit), Worktree (worktree_list, worktree_add, worktree_remove), Artifacts (save_artifact, read_artifact), Memory (store_memory, retrieve_memory), and Network/Browser (fetch_url). Enforced path traversal defense, SSRF boundary, prototype pollution guards, secret scrubbing, and SQLite EventStore audit durability.

### [TASK-P4.2-TOOLGATEWAY — ToolGateway, Schema Validation & Idempotency](file:///C:/herness/src/tools/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Tool & Execution Architect
- **Completed Date**: 2026-08-31
- **Verification**: 289/289 tests passing across 128 test suites in Vitest. Authoritative ToolGateway execution boundary, tool registry, strict runtime schema validation with prototype pollution defense, P4.1 PolicyEngine & ApprovalManager integration, capability checks, execution timeouts via AbortController, idempotency caching and concurrency deduplication, normalized error mapping, immutable event/observation emission, and zero-state-loss SQLite durability.

### [TASK-P4.1-POLICY — Policy Engine, Risk Classification & Approval Gates](file:///C:/herness/src/policy/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Security & Policy Architect
- **Completed Date**: 2026-08-31
- **Verification**: 269/269 tests passing across 118 test suites in Vitest. Authoritative PolicyEngine with strict precedence hierarchy, fail-closed evaluation, zero-secret-leakage, RiskClassifier with deterministic LOW/MEDIUM/HIGH/CRITICAL tiering, ApprovalManager with SHA-256 canonical TOCTOU binding, expiration/drift revalidation, immutable SQLite audit events, and P4 Gate zero-state-loss durability.

### [TASK-P3.5-INTEGRATIONS — OpenRouter, Direct Providers & Custom Endpoints](file:///C:/herness/src/models/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Integrations Architect
- **Completed Date**: 2026-08-31
- **Verification**: 244/244 tests passing across 108 test suites in Vitest. First-class ProviderAdapters for OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, Local/Custom (vLLM/Ollama), and OpenAI-compatible gateways. Complete streaming SSE parsing, tool call normalization, token accounting, typed error mappings, SSRF scheme boundary enforcement, prototype pollution defense, and zero-secret leakage.

### [TASK-P3.4-AUTH-HEALTH — Auth Profiles, Key Pools, Rate Limits & Provider Health](file:///C:/herness/src/models/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Security & Infrastructure Architect
- **Completed Date**: 2026-08-31
- **Verification**: 218/218 tests passing across 98 test suites in Vitest. Zero-secret-leakage CredentialReference contracts, SecretStore boundary, KeyPoolManager with per-key concurrency and rate-limiting lease management, stale lease recovery, independent Provider/Model/Credential health state machines, ModelRouter integration, and P3 Gate zero-state-loss SQLite durability.

### [TASK-P3.3-ROUTER — ModelRouter, Explainability & Bounded Failover Cascades](file:///C:/herness/src/models/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal AI Platform Architect
- **Completed Date**: 2026-08-31
- **Verification**: 203/203 tests passing across 90 test suites in Vitest. Deterministic ModelRouter with capability-first candidate filtering, explicit preference/priority ranking, structured explainability (RoutingDecision with rejected candidate reasons), transient error failover cascades (RateLimitError, ProviderUnavailableError, ModelTimeoutError), non-retryable error safety aborts, data sensitivity isolation, and zero-state-loss SQLite durability under failover.

### [TASK-P3.2-CAPABILITY — Capability Model, Taxonomy & Capability Resolver](file:///C:/herness/src/models/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal AI Platform Architect
- **Completed Date**: 2026-08-31
- **Verification**: 191/191 tests passing across 83 test suites in Vitest. Granular Input/Output modalities, execution features, quantitative token constraints (contextWindow, maxOutputTokens), deterministic CapabilityResolver (COMPATIBLE, INCOMPATIBLE, UNKNOWN, LIMIT_EXCEEDED), staleness handling, and Capability != Authorization security isolation.

### [TASK-P3.1-ADAPTERS — Unified ModelAdapter, ProviderAdapter & Error Classification](file:///C:/herness/src/models/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Model & Integrations Architect
- **Completed Date**: 2026-08-31
- **Verification**: 175/175 tests passing across 76 test suites in Vitest. Unified ModelRequest/ModelResponse/ModelStreamChunk domain contracts, MockProviderAdapter with unary & streaming execution, normalized tool calling, token usage/cost accounting, structured error hierarchy (RateLimitError, AuthenticationError, ContextWindowExceededError, ProviderUnavailableError, ModelTimeoutError), and P3 Gate SQLite state durability verification.

### [TASK-P2.6-MEMORY — Scoped Memory, Provenance, SQLite FTS5 & Rebuildable Retrieval](file:///C:/herness/src/memory/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Retrieval & Knowledge Engineer
- **Completed Date**: 2026-08-31
- **Verification**: 161/161 tests passing across 70 test suites in Vitest. Scoped memory stores, memory item provenance, SQLite FTS5 full-text indexing, composite ranking (BM25 + confidence + priority), 100% index rebuildability from authoritative memory_items, ContextEngine integration, and Data != Policy security isolation.

### [TASK-P2.5-COMPACTION — Session Compaction, Preview, Undo & History Preservation](file:///C:/herness/src/compaction/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Context & State Engineer
- **Completed Date**: 2026-08-31
- **Verification**: 153/153 tests passing across 64 test suites in Vitest. Non-destructive preview, /compact execution emitting immutable context.compacted events, structured CompactionSummary (objectives, constraints, facts, decisions, unresolved items, artifacts), /compact undo rollback, auto-compact token pressure trigger, and zero-authoritative-history-loss invariant.

### [TASK-P2.4-CONTEXT — ContextPlan, Relevance, Capabilities, Token Budget, /context](file:///C:/herness/src/context/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Context & LLM Engineer
- **Completed Date**: 2026-08-30
- **Verification**: 148/148 tests passing across 58 test suites in Vitest. ContextPlan assembly, deterministic relevance & priority ranking (CRITICAL > HIGH > NORMAL > LOW > DROP), capability matching via RepresentationSelector, token budgeting, tool schema allocation, ToolResultPruner for oversized outputs, security isolation, and /context inspection report.

### [TASK-P2.3-ARTIFACTS — Durable Writes, Hashes, Metadata & Verification](file:///C:/herness/src/artifacts/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Senior Persistence & Artifacts Engineer
- **Completed Date**: 2026-08-30
- **Verification**: 138/138 tests passing across 52 test suites in Vitest. Atomic durable writes (.tmp rename), SHA-256 integrity verification, ArtifactRepository metadata persistence, verification lifecycle (unverified -> verified/failed), storage path traversal prevention, and cross-project isolation.

### [TASK-P2.2-CONTENT-SECURITY — Content Security, MIME Validation & Provenance](file:///C:/herness/src/content/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Senior Security Engineer
- **Completed Date**: 2026-08-30
- **Verification**: 129/129 tests passing across 47 test suites in Vitest. MIME spoofing detection (PE/ELF/Mach-O disguise checks), archive bomb & decompression amplification ratio protection, automated credential scanning & secret redaction (ContentSanitizer), provenance lineage chaining (ProvenanceManager), sensitivity downgrade lockdown, and cross-project isolation.

### [TASK-P2.1-CONTENT-INGESTION — Multimodal Content Ingestion & Parsers](file:///C:/herness/src/content/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Senior Systems Engineer
- **Completed Date**: 2026-08-30
- **Verification**: 114/114 tests passing across 43 test suites in Vitest. Provider-neutral multimodal ingestion, magic byte MIME sniffing, size guardrails, Zip Slip security checks, specialized parsers for Text, Code, Markdown, JSON, CSV, PDF, Image, Media, and Archive, unknown binary preservation, RepresentationSelector, ContentReferenceManager, and ContentAccessValidator.

### [TASK-P1.5-RESUME-ENGINE — Durable Session Resume Engine (`/resume`)](file:///C:/herness/src/resume/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Core Architect
- **Completed Date**: 2026-08-30
- **Verification**: 90/90 tests passing across 35 test suites in Vitest. Durable session reconstruction from SQLite events + checkpoints, Task DAG topological sort and crash reconciliation, pending approval restoration, and disk restart verification. P1 Gate officially certified.

### [TASK-P1.4-CHECKPOINTS-RECOVERY — Manifests, Validation, Leases & Crash Recovery](file:///C:/herness/src/recovery/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Recovery Architect
- **Completed Date**: 2026-08-30
- **Verification**: 77/77 tests passing across 29 test suites in Vitest. Checkpoint manifests, cryptographic validation, LeaseManager, OrphanDetector, and CrashRecoveryEngine with real disk failure matrix simulation.

### [TASK-P1.3-EVENT-STATE — EventStore, Reducers, Projections & Branching](file:///C:/herness/src/event-state/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Lead Event Systems Engineer
- **Completed Date**: 2026-08-30
- **Verification**: 61/61 tests passing across 24 test suites. Full event append, aggregate reconstruction, projection rebuild, and branching isolation.
- **Commit**: `388c4e8`

### [TASK-P1.2-PERSISTENCE — Native SQLite Engine, WAL, Migrations & Repositories](file:///C:/herness/src/persistence/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Database Architect
- **Completed Date**: 2026-08-30
- **Verification**: 51/51 tests passing. WAL mode, synchronous=FULL, foreign keys, SHA-256 migration tracking, and 8 domain repositories.
- **Commit**: `e7d7c56`

### [TASK-P1.1-CORE-DOMAIN — Core Domain Models, Zod Schemas & State Machine](file:///C:/herness/src/domain/index.ts)
- **Status**: `COMPLETED`
- **Owner**: Principal Systems Architect
- **Completed Date**: 2026-08-30
- **Verification**: 37/37 tests passing. 12 core domain contracts, runtime validation, immutability helpers.
- **Commit**: `67e0406`
