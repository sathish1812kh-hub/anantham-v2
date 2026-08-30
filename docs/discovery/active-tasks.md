# Active Tasks Registry — Anantham V2

This document tracks active, blocked, and recently completed sprint tasks. It is synchronized after task completion events to preserve operational awareness across sessions.

---

## 1. Active Phase Backlog (P4 — Policy / Tools / Execution)

### [P4.2 — ToolGateway, Schema Validation & Idempotency](file:///C:/herness/docs/discovery/current-state.md#L10)
- **Status**: `READY_FOR_EXECUTION`
- **Owner**: Principal Tool & Execution Architect
- **Description**: Implement authoritative ToolGateway boundary, schema validation, policy check integration, approval gate enforcement, capability checks, execution timeouts, idempotency caching, normalized errors, and observation/artifact event recording.
- **Dependencies**: `P1.1–P1.5`, `P2.1–P2.6`, `P3.1–P3.5`, `P4.1`.

---

## 2. Completed Milestones (Recent)

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
