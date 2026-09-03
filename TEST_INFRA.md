# E2E Test Infra: Anantham V2

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.
- Progressive testability: Tier 1 tests verify fundamental contracts; Tier 2 tests boundaries/extremes; Tier 3 tests cross-feature interactions; Tier 4 tests realistic end-to-end engineering workflows.

## Feature Inventory Coverage Matrix (88 PRD Features)
| # | Feature ID | Feature Name | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) |
|---|------------|--------------|:----------------:|:-----------------:|:-----------------:|
| 1 | `PRD-DUR-008` | Automated Database Backup & Point-in-Time Restore | 5 tests | 5 tests | ✓ |
| 2 | `PRD-RESUME-003` | Model Migration on Resume | 5 tests | 5 tests | ✓ |
| 3 | `PRD-RESUME-006` | Background Process Reconnection | 5 tests | 5 tests | ✓ |
| 4 | `PRD-COMPACT-006` | Compaction Quality & Loss Measurement | 5 tests | 5 tests | ✓ |
| 5 | `PRD-PART2-306` | Browser Session Timeout & Zombie Reclamation | 5 tests | 5 tests | ✓ |
| 6 | `PRD-PART2-308` | External Connector Network Timeout & DLQ Routing | 5 tests | 5 tests | ✓ |
| 7 | `F-REC-11` | Automated WAL Checkpoint & Compression Schedule | 5 tests | 5 tests | ✓ |
| 8 | `F-REC-12` | Incremental Snapshot & Point-in-Time Rollback | 5 tests | 5 tests | ✓ |
| 9 | `F-REC-13` | Session Fork Point-in-Time Recovery | 5 tests | 5 tests | ✓ |
| 10 | `F-REC-14` | External Service Lease Reconciliation on Resume | 5 tests | 5 tests | ✓ |
| 11 | `PRD-MEM-003` | Memory Decay, TTL & Access Frequency Pruning | 5 tests | 5 tests | ✓ |
| 12 | `PRD-SRCH-001` | Universal Content Search & Cross-Modality Query | 5 tests | 5 tests | ✓ |
| 13 | `PRD-GOV-001` | Data Retention, Quotas & Resource Management | 5 tests | 5 tests | ✓ |
| 14 | `PRD-GOV-002` | Air-Gapped & Offline Operating Mode | 5 tests | 5 tests | ✓ |
| 15 | `PRD-CODE-001` | Code Intelligence Plane Architecture & Components | 5 tests | 5 tests | ✓ |
| 16 | `PRD-CODE-002` | CodeIndex API Interface | 5 tests | 5 tests | ✓ |
| 17 | `PRD-CODE-003` | Multi-Language AST & Parser Adapters | 5 tests | 5 tests | ✓ |
| 18 | `PRD-CODE-004` | LSP Client Bridge Integration | 5 tests | 5 tests | ✓ |
| 19 | `PRD-CODE-005` | Incremental Code Indexing | 5 tests | 5 tests | ✓ |
| 20 | `PRD-CODE-006` | Project Knowledge Graph | 5 tests | 5 tests | ✓ |
| 21 | `PRD-INV-001` | Strict Code Intelligence Invariants & Fault Isolation | 5 tests | 5 tests | ✓ |
| 22 | `PRD-PROJ-003` | Project Remove Semantics & Deletion Safety | 5 tests | 5 tests | ✓ |
| 23 | `PRD-PROJ-005` | Project Discovery & Tech Stack Bootstrap | 5 tests | 5 tests | ✓ |
| 24 | `PRD-PROJ-006` | Project Instructions Compatibility Loader | 5 tests | 5 tests | ✓ |
| 25 | `PRD-PROJ-009` | Multi-Root Workspace & Monorepo Support | 5 tests | 5 tests | ✓ |
| 26 | `PRD-FS-001` | Live File Watching & Index Synchronization | 5 tests | 5 tests | ✓ |
| 27 | `PRD-PART2-216` | Ecosystem Source Compatibility & Config Importers | 5 tests | 5 tests | ✓ |
| 28 | `PRD-PART2-217` | Configuration Migration Slash Commands | 5 tests | 5 tests | ✓ |
| 29 | `F-REL-14` | Monorepo & Multi-Root Workspace Discovery | 5 tests | 5 tests | ✓ |
| 30 | `PRD-SEC-004` | Security Audit Logging & Tamper Detection | 5 tests | 5 tests | ✓ |
| 31 | `PRD-SEC-005` | Incident Response & Compromised Agent Quarantine | 5 tests | 5 tests | ✓ |
| 32 | `PRD-PART2-191` | Interactive Policy Explanation | 5 tests | 5 tests | ✓ |
| 33 | `PRD-PART2-192` | Policy Dry-Run Simulation Engine | 5 tests | 5 tests | ✓ |
| 34 | `F-SEC-13` | Policy Explanation & Dry-Run Simulation | 5 tests | 5 tests | ✓ |
| 35 | `F-SEC-14` | Real-Time Policy Invalidation & Dynamic Reload | 5 tests | 5 tests | ✓ |
| 36 | `F-SEC-15` | Malicious Prompt Sandbox Isolation & Quarantine | 5 tests | 5 tests | ✓ |
| 37 | `F-SEC-16` | Security Audit Trail Cryptographic Export | 5 tests | 5 tests | ✓ |
| 38 | `PRD-DATA-008` | Attachment Registry & Slash Commands | 5 tests | 5 tests | ✓ |
| 39 | `PRD-DATA-010` | Clipboard & Visual Screenshot Input | 5 tests | 5 tests | ✓ |
| 40 | `PRD-DATA-012` | Office Document Extraction (DOCX, XLSX, PPTX) | 5 tests | 5 tests | ✓ |
| 41 | `PRD-DATA-013` | Audio & Video Multi-Stage Processing Pipeline | 5 tests | 5 tests | ✓ |
| 42 | `PRD-PART2-146` | Browser Execution Engine | 5 tests | 5 tests | ✓ |
| 43 | `PRD-PART2-147` | OS Computer Use & Desktop Automation | 5 tests | 5 tests | ✓ |
| 44 | `F-MM-08` | Visual Diff Inspector | 5 tests | 5 tests | ✓ |
| 45 | `F-MM-09` | Audio Waveform & Video Scene Timeline | 5 tests | 5 tests | ✓ |
| 46 | `F-MM-10` | Artifact Generation Gallery | 5 tests | 5 tests | ✓ |
| 47 | `F-MM-11` | Multimodal Storage GC & Quota Management | 5 tests | 5 tests | ✓ |
| 48 | `F-CLI-08` | CLI Shell Auto-Completion Trie Engine | 5 tests | 5 tests | ✓ |
| 49 | `F-CLI-09` | CLI Command Alias & Abbreviation Layer | 5 tests | 5 tests | ✓ |
| 50 | `F-CLI-10` | Global vs Scoped Slash Grammar Resolution | 5 tests | 5 tests | ✓ |
| 51 | `F-CLI-11` | Streaming Interrupt & Hot-Resume Grammar | 5 tests | 5 tests | ✓ |
| 52 | `F-CLI-12` | Batch & Pipe Multi-Command Grammar | 5 tests | 5 tests | ✓ |
| 53 | `F-CLI-13` | Command History Search & Fuzzy Matching | 5 tests | 5 tests | ✓ |
| 54 | `F-TUI-10` | Terminal Window Resize & Reflow Engine | 5 tests | 5 tests | ✓ |
| 55 | `F-TUI-11` | Multi-Pane Split Layout & Agent Inspection View | 5 tests | 5 tests | ✓ |
| 56 | `F-TUI-12` | TUI Modal Dialogs & TOCTOU Confirmation Overlays | 5 tests | 5 tests | ✓ |
| 57 | `F-TUI-13` | ANSI Color Theme & High-Contrast Mode | 5 tests | 5 tests | ✓ |
| 58 | `F-OBS-10` | Distributed Span Export via OTLP / OpenTelemetry | 5 tests | 5 tests | ✓ |
| 59 | `F-OBS-11` | Log Redaction Engine for High-Entropy Secrets | 5 tests | 5 tests | ✓ |
| 60 | `F-OBS-12` | Real-Time Memory & Token Cost Visualization | 5 tests | 5 tests | ✓ |
| 61 | `F-REL-10` | Native Installer Packages for Windows/macOS/Linux | 5 tests | 5 tests | ✓ |
| 62 | `F-REL-11` | Self-Update & Semantic Release Channel Switcher | 5 tests | 5 tests | ✓ |
| 63 | `F-REL-12` | Automated Health Check & Environment Doctor Diagnostic | 5 tests | 5 tests | ✓ |
| 64 | `F-REL-13` | Air-Gapped Distribution Bundle & Offline Dependency Pack | 5 tests | 5 tests | ✓ |
| 65 | `PRD-PART2-122` | External SaaS API Connectors | 5 tests | 5 tests | ✓ |
| 66 | `PRD-PART2-124` | GitHub Issue & PR Integration | 5 tests | 5 tests | ✓ |
| 67 | `PRD-PART2-125` | Automated Multi-Step PR Lifecycle | 5 tests | 5 tests | ✓ |
| 68 | `PRD-PART2-393` | REST HTTP Agent Status & Control API | 5 tests | 5 tests | ✓ |
| 69 | `PRD-PART2-394` | REST HTTP Team Status & Management API | 5 tests | 5 tests | ✓ |
| 70 | `PRD-PART2-396` | REST HTTP Provider CRUD API | 5 tests | 5 tests | ✓ |
| 71 | `PRD-PART2-397` | REST HTTP API Key Management API | 5 tests | 5 tests | ✓ |
| 72 | `PRD-PART2-398` | REST HTTP MCP Server Management API | 5 tests | 5 tests | ✓ |
| 73 | `PRD-PART2-399` | REST HTTP Plugin Management API | 5 tests | 5 tests | ✓ |
| 74 | `PRD-PART2-400` | REST HTTP Skill Management API | 5 tests | 5 tests | ✓ |
| 75 | `PRD-PART2-206` | Specialized Agent Role Completion Benchmarks | 5 tests | 5 tests | ✓ |
| 76 | `PRD-PART2-207` | Multi-Agent Team Coordination Benchmarks | 5 tests | 5 tests | ✓ |
| 77 | `PRD-PART2-208` | Parallelism Speedup & Contention Benchmarks | 5 tests | 5 tests | ✓ |
| 78 | `PRD-PART2-209` | API Key Pool Fairness & Quota Optimization Benchmarks | 5 tests | 5 tests | ✓ |
| 79 | `PRD-PART2-210` | Model Router Accuracy & Cost Optimization Benchmarks | 5 tests | 5 tests | ✓ |
| 80 | `PRD-PART2-211` | Extension & Plugin Lifecycle Stress Matrix | 5 tests | 5 tests | ✓ |
| 81 | `PRD-PART2-212` | MCP Server Protocol Failure Matrix | 5 tests | 5 tests | ✓ |
| 82 | `PRD-PART2-213` | Executor Sandbox Resource Starvation Matrix | 5 tests | 5 tests | ✓ |
| 83 | `PRD-PART2-214` | Comprehensive Agent Failure & Hallucination Matrix | 5 tests | 5 tests | ✓ |
| 84 | `PRD-PART2-275` | Model Speed/Latency Dynamic Calibration Harness | 5 tests | 5 tests | ✓ |
| 85 | `F-EVAL-11` | Model Routing Quality & Cost Benchmark Suite | 5 tests | 5 tests | ✓ |
| 86 | `F-EVAL-12` | Agent Team Coordination & Handoff Benchmark | 5 tests | 5 tests | ✓ |
| 87 | `F-EVAL-13` | Tool Gateway Risk Classification Precision Benchmark | 5 tests | 5 tests | ✓ |
| 88 | `F-EVAL-14` | Recovery Time Objective (RTO) Durability Benchmark | 5 tests | 5 tests | ✓ |

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Monorepo Multi-Agent Development Workflow | F15..21, F25, F29, F48..53, F68..74 | High |
| 2 | Crash During High-Concurrency Multi-Agent Session & Clean PITR Resume | F1..10, F11, F13, F30, F31 | Critical |
| 3 | Untrusted SaaS Webhook Ingestion & Malicious Prompt Quarantine | F6, F31, F35, F36, F65..67 | High |
| 4 | Multi-Language AST Indexing with Live File Watcher Synchronized to TUI | F15..21, F26, F54..57, F60 | High |
| 5 | End-to-End Autonomous GitHub PR Lifecycle with Doctor Diagnostics | F62..64, F66, F67, F75..88 | High |

## Test Architecture & Invocation
- Runner: Node test runner (`node --test --import tsx/esm`)
- Suite Command: `npm test`
- Pass/Fail Criterion: 100% test pass rate across all suites with 0 unhandled rejections.
