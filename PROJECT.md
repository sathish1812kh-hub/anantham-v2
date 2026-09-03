# Project: Anantham V2 — Full 88-Feature PRD Implementation & Verification Plan

## Architecture
Anantham V2 is a resilient, local-first multi-agent autonomous engineering platform.
Core architectural layers:
1. **Control & Persistence Plane:** SQLite WAL mode with `synchronous = FULL`, immutable event sourcing, durable checkpoint recovery, lease management, and incremental snapshots.
2. **Code Intelligence Plane:** Multi-language AST parsing (TS/JS, Python, Go, Rust, Java, C/C++), LSP bridge, symbol index, incremental file watching, and unified Project Knowledge Graph.
3. **Execution & Policy Plane:** Fail-closed `ToolGateway`, 6-level policy evaluation, HMAC audit chaining, incident quarantine, micro-VM/process sandboxes, browser automation, and computer use.
4. **Interaction & Management Plane:** Interactive CLI/TUI, slash grammar, trie auto-completion, streaming interrupt/resume, SaaS connectors (Jira/Linear/Slack/GitHub), and REST HTTP APIs (`/v1/agents`, `/v1/teams`, `/v1/providers`, `/v1/keys`, `/v1/mcp`, `/v1/plugins`, `/v1/skills`).
5. **Evaluation & Quality Plane:** Standardized role/team benchmarks, parallel scaling, key pool fairness, router optimization, fault injection matrices, and RTO durability benchmarks.

## Code Layout
- `src/domain/`: Domain entities, schemas, and invariants (Zod contracts)
- `src/persistence/`: SQLite repositories, migrations, WAL management, backups
- `src/event-state/`: Event store, projection engines, delta snapshots, reducers
- `src/code-intel/`: AST adapters, LSP bridge, symbol index, project knowledge graph
- `src/content/`: Multimodal extractors, office parsers, media timelines, attachment storage
- `src/execution/`: Local executor, browser executor, computer-use executor, sandboxes
- `src/policy/`: Policy engine, risk classifier, HMAC audit chain, incident quarantine
- `src/teams/`: Agent roles, team manager, swarms, handoffs
- `src/cli/` & `src/tui/`: Slash commands, trie completion, TUI layouts, modals
- `src/integrations/`: SaaS connectors (Jira, Linear, Slack, Sentry), GitHub PR automation
- `src/api/`: REST HTTP routers and controllers
- `src/observability/`: OTLP span exporter, secret redaction, telemetry
- `src/evaluation/`: Role benchmarks, team benchmarks, fault injection matrices
- `tests/`: Automated test suites corresponding to all subsystems

---

## Feature Inventory
| # | Feature ID | Feature Name & Scope | Cluster | Milestone | Source |
|---|------------|----------------------|:-------:|:---------:|:------:|
| 1 | `PRD-DUR-008` | Automated Database Backup & Point-in-Time Restore | C6 | M1 | missing-features.md §5 |
| 2 | `PRD-RESUME-003` | Model Migration on Resume | C6 | M1 | missing-features.md §5 |
| 3 | `PRD-RESUME-006` | Background Process Reconnection | C6 | M1 | missing-features.md §5 |
| 4 | `PRD-COMPACT-006` | Compaction Quality & Loss Measurement | C6 | M1 | missing-features.md §5 |
| 5 | `PRD-PART2-306` | Browser Session Timeout & Zombie Reclamation | C6 | M1 | missing-features.md §5 |
| 6 | `PRD-PART2-308` | External Connector Network Timeout & DLQ Routing | C6 | M1 | missing-features.md §5 |
| 7 | `F-REC-11` | Automated WAL Checkpoint & Compression Schedule | C6 | M1 | missing-features.md §5 |
| 8 | `F-REC-12` | Incremental Snapshot & Point-in-Time Rollback | C6 | M1 | missing-features.md §5 |
| 9 | `F-REC-13` | Session Fork Point-in-Time Recovery | C6 | M1 | missing-features.md §5 |
| 10 | `F-REC-14` | External Service Lease Reconciliation on Resume | C6 | M1 | missing-features.md §5 |
| 11 | `PRD-MEM-003` | Memory Decay, TTL & Access Frequency Pruning | C7 | M1 | missing-features.md §5 |
| 12 | `PRD-SRCH-001` | Universal Content Search & Cross-Modality Query | C7 | M1 | missing-features.md §5 |
| 13 | `PRD-GOV-001` | Data Retention, Quotas & Resource Management | C7 | M1 | missing-features.md §5 |
| 14 | `PRD-GOV-002` | Air-Gapped & Offline Operating Mode | C7 | M1 | missing-features.md §5 |
| 15 | `PRD-CODE-001` | Code Intelligence Plane Architecture & Components | C1 | M2 | missing-features.md §5 |
| 16 | `PRD-CODE-002` | CodeIndex API Interface | C1 | M2 | missing-features.md §5 |
| 17 | `PRD-CODE-003` | Multi-Language AST & Parser Adapters | C1 | M2 | missing-features.md §5 |
| 18 | `PRD-CODE-004` | LSP Client Bridge Integration | C1 | M2 | missing-features.md §5 |
| 19 | `PRD-CODE-005` | Incremental Code Indexing | C1 | M2 | missing-features.md §5 |
| 20 | `PRD-CODE-006` | Project Knowledge Graph | C1 | M2 | missing-features.md §5 |
| 21 | `PRD-INV-001` | Strict Code Intelligence Invariants & Fault Isolation | C1 | M2 | missing-features.md §5 |
| 22 | `PRD-PROJ-003` | Project Remove Semantics & Deletion Safety | C3 | M2 | missing-features.md §5 |
| 23 | `PRD-PROJ-005` | Project Discovery & Tech Stack Bootstrap | C3 | M2 | missing-features.md §5 |
| 24 | `PRD-PROJ-006` | Project Instructions Compatibility Loader | C3 | M2 | missing-features.md §5 |
| 25 | `PRD-PROJ-009` | Multi-Root Workspace & Monorepo Support | C3 | M2 | missing-features.md §5 |
| 26 | `PRD-FS-001` | Live File Watching & Index Synchronization | C3 | M2 | missing-features.md §5 |
| 27 | `PRD-PART2-216` | Ecosystem Source Compatibility & Config Importers | C3 | M2 | missing-features.md §5 |
| 28 | `PRD-PART2-217` | Configuration Migration Slash Commands | C3 | M2 | missing-features.md §5 |
| 29 | `F-REL-14` | Monorepo & Multi-Root Workspace Discovery | C3 | M2 | missing-features.md §5 |
| 30 | `PRD-SEC-004` | Security Audit Logging & Tamper Detection | C8 | M3 | missing-features.md §5 |
| 31 | `PRD-SEC-005` | Incident Response & Compromised Agent Quarantine | C8 | M3 | missing-features.md §5 |
| 32 | `PRD-PART2-191` | Interactive Policy Explanation | C8 | M3 | missing-features.md §5 |
| 33 | `PRD-PART2-192` | Policy Dry-Run Simulation Engine | C8 | M3 | missing-features.md §5 |
| 34 | `F-SEC-13` | Policy Explanation & Dry-Run Simulation | C8 | M3 | missing-features.md §5 |
| 35 | `F-SEC-14` | Real-Time Policy Invalidation & Dynamic Reload | C8 | M3 | missing-features.md §5 |
| 36 | `F-SEC-15` | Malicious Prompt Sandbox Isolation & Quarantine | C8 | M3 | missing-features.md §5 |
| 37 | `F-SEC-16` | Security Audit Trail Cryptographic Export | C8 | M3 | missing-features.md §5 |
| 38 | `PRD-DATA-008` | Attachment Registry & Slash Commands | C2 | M3 | missing-features.md §5 |
| 39 | `PRD-DATA-010` | Clipboard & Visual Screenshot Input | C2 | M3 | missing-features.md §5 |
| 40 | `PRD-DATA-012` | Office Document Extraction (DOCX, XLSX, PPTX) | C2 | M3 | missing-features.md §5 |
| 41 | `PRD-DATA-013` | Audio & Video Multi-Stage Processing Pipeline | C2 | M3 | missing-features.md §5 |
| 42 | `PRD-PART2-146` | Browser Execution Engine | C2 | M3 | missing-features.md §5 |
| 43 | `PRD-PART2-147` | OS Computer Use & Desktop Automation | C2 | M3 | missing-features.md §5 |
| 44 | `F-MM-08` | Visual Diff Inspector | C2 | M3 | missing-features.md §5 |
| 45 | `F-MM-09` | Audio Waveform & Video Scene Timeline | C2 | M3 | missing-features.md §5 |
| 46 | `F-MM-10` | Artifact Generation Gallery | C2 | M3 | missing-features.md §5 |
| 47 | `F-MM-11` | Multimodal Storage GC & Quota Management | C2 | M3 | missing-features.md §5 |
| 48 | `F-CLI-08` | CLI Shell Auto-Completion Trie Engine | C4 | M4 | missing-features.md §5 |
| 49 | `F-CLI-09` | CLI Command Alias & Abbreviation Layer | C4 | M4 | missing-features.md §5 |
| 50 | `F-CLI-10` | Global vs Scoped Slash Grammar Resolution | C4 | M4 | missing-features.md §5 |
| 51 | `F-CLI-11` | Streaming Interrupt & Hot-Resume Grammar | C4 | M4 | missing-features.md §5 |
| 52 | `F-CLI-12` | Batch & Pipe Multi-Command Grammar | C4 | M4 | missing-features.md §5 |
| 53 | `F-CLI-13` | Command History Search & Fuzzy Matching | C4 | M4 | missing-features.md §5 |
| 54 | `F-TUI-10` | Terminal Window Resize & Reflow Engine | C5 | M4 | missing-features.md §5 |
| 55 | `F-TUI-11` | Multi-Pane Split Layout & Agent Inspection View | C5 | M4 | missing-features.md §5 |
| 56 | `F-TUI-12` | TUI Modal Dialogs & TOCTOU Confirmation Overlays | C5 | M4 | missing-features.md §5 |
| 57 | `F-TUI-13` | ANSI Color Theme & High-Contrast Mode | C5 | M4 | missing-features.md §5 |
| 58 | `F-OBS-10` | Distributed Span Export via OTLP / OpenTelemetry | C10 | M4 | missing-features.md §5 |
| 59 | `F-OBS-11` | Log Redaction Engine for High-Entropy Secrets | C10 | M4 | missing-features.md §5 |
| 60 | `F-OBS-12` | Real-Time Memory & Token Cost Visualization | C10 | M4 | missing-features.md §5 |
| 61 | `F-REL-10` | Native Installer Packages for Windows/macOS/Linux | C10 | M4 | missing-features.md §5 |
| 62 | `F-REL-11` | Self-Update & Semantic Release Channel Switcher | C10 | M4 | missing-features.md §5 |
| 63 | `F-REL-12` | Automated Health Check & Environment Doctor Diagnostic | C10 | M4 | missing-features.md §5 |
| 64 | `F-REL-13` | Air-Gapped Distribution Bundle & Offline Dependency Pack | C10 | M4 | missing-features.md §5 |
| 65 | `PRD-PART2-122` | External SaaS API Connectors | C11 | M4 | missing-features.md §5 |
| 66 | `PRD-PART2-124` | GitHub Issue & PR Integration | C11 | M4 | missing-features.md §5 |
| 67 | `PRD-PART2-125` | Automated Multi-Step PR Lifecycle | C11 | M4 | missing-features.md §5 |
| 68 | `PRD-PART2-393` | REST HTTP Agent Status & Control API | C12 | M4 | missing-features.md §5 |
| 69 | `PRD-PART2-394` | REST HTTP Team Status & Management API | C12 | M4 | missing-features.md §5 |
| 70 | `PRD-PART2-396` | REST HTTP Provider CRUD API | C12 | M4 | missing-features.md §5 |
| 71 | `PRD-PART2-397` | REST HTTP API Key Management API | C12 | M4 | missing-features.md §5 |
| 72 | `PRD-PART2-398` | REST HTTP MCP Server Management API | C12 | M4 | missing-features.md §5 |
| 73 | `PRD-PART2-399` | REST HTTP Plugin Management API | C12 | M4 | missing-features.md §5 |
| 74 | `PRD-PART2-400` | REST HTTP Skill Management API | C12 | M4 | missing-features.md §5 |
| 75 | `PRD-PART2-206` | Specialized Agent Role Completion Benchmarks | C9 | M5 | missing-features.md §5 |
| 76 | `PRD-PART2-207` | Multi-Agent Team Coordination Benchmarks | C9 | M5 | missing-features.md §5 |
| 77 | `PRD-PART2-208` | Parallelism Speedup & Contention Benchmarks | C9 | M5 | missing-features.md §5 |
| 78 | `PRD-PART2-209` | API Key Pool Fairness & Quota Optimization Benchmarks | C9 | M5 | missing-features.md §5 |
| 79 | `PRD-PART2-210` | Model Router Accuracy & Cost Optimization Benchmarks | C9 | M5 | missing-features.md §5 |
| 80 | `PRD-PART2-211` | Extension & Plugin Lifecycle Stress Matrix | C9 | M5 | missing-features.md §5 |
| 81 | `PRD-PART2-212` | MCP Server Protocol Failure Matrix | C9 | M5 | missing-features.md §5 |
| 82 | `PRD-PART2-213` | Executor Sandbox Resource Starvation Matrix | C9 | M5 | missing-features.md §5 |
| 83 | `PRD-PART2-214` | Comprehensive Agent Failure & Hallucination Matrix | C9 | M5 | missing-features.md §5 |
| 84 | `PRD-PART2-275` | Model Speed/Latency Dynamic Calibration Harness | C9 | M5 | missing-features.md §5 |
| 85 | `F-EVAL-11` | Model Routing Quality & Cost Benchmark Suite | C9 | M5 | missing-features.md §5 |
| 86 | `F-EVAL-12` | Agent Team Coordination & Handoff Benchmark | C9 | M5 | missing-features.md §5 |
| 87 | `F-EVAL-13` | Tool Gateway Risk Classification Precision Benchmark | C9 | M5 | missing-features.md §5 |
| 88 | `F-EVAL-14` | Recovery Time Objective (RTO) Durability Benchmark | C9 | M5 | missing-features.md §5 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Durability, Storage & Session Lifecycle | Features 1–14 (Clusters 6 & 7) | none | DONE |
| M2 | Code Intelligence & Workspace Governance | Features 15–29 (Clusters 1 & 3) | M1 | DONE |
| M3 | Security Policy, Sandboxes & Multimodal Execution | Features 30–47 (Clusters 8 & 2) | M1, M2 | DONE |
| M4 | CLI/TUI Shell, Observability, SaaS & REST APIs | Features 48–74 (Clusters 4, 5, 10, 11, 12) | M1, M2, M3 | DONE |
| M5 | Evaluation Benchmarks & Quality Matrices | Features 75–88 (Cluster 9) | M1, M2, M3, M4 | DONE |
| M6 | Final E2E Suite & Adversarial Coverage Hardening | All 88 Features (Tiers 1–5) | M1, M2, M3, M4, M5 | DONE |

---

## Interface Contracts
### M1 (Durability & State) ↔ M2 (Code Intelligence & Workspace)
- `EventStore.appendEvent()` and `EventStore.getEventsBySession()` provide immutable stream access.
- `IncrementalSnapshotManager.takeSnapshot()` provides state checkpointing for Workspace and Knowledge Graph.
- `UniversalContentSearch` integrates with `CodeIndex` FTS5 tables for global symbol and text query aggregation.

### M1/M2 (Storage & CodeIntel) ↔ M3 (Security Policy & Multimodal)
- `HmacAuditChain` binds all `ToolGateway` approval decisions to durable SHA-256 event chains.
- `IncidentQuarantineManager` intercepts policy violations, freezes session leases via `LeaseManager`, and emits incident events.
- `OfficeDocumentParser` and `MultimediaPipeline` produce standardized `ContentObject` entities with full provenance.

### M1..M3 (Core Engine) ↔ M4 (CLI/TUI/APIs & SaaS Connectors)
- `ApiRouter` exposes REST HTTP endpoints for agents, teams, providers, keys, MCPs, plugins, and skills.
- `InteractiveTuiLayout` listens for streaming session events and renders multi-pane inspection views.
- `SaaSConnectorManager` and `GitHubIntegrationEngine` leverage `WebhookDispatcher` and `EventStore`.

### M1..M4 (Full Platform) ↔ M5/M6 (Evaluation & E2E Verification)
- Benchmark suites execute standardized test matrices against actual implementations of all subsystems.
- E2E Test Suite (Tiers 1–4) exercises public CLI, REST API, and domain entry points.
