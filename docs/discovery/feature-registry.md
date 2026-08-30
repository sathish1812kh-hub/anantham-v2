# Feature Registry — Anantham V2

This document tracks all features and architectural capabilities across Phases P0 through P9.

---

## Feature Matrix

| Feature ID | Phase | Feature Name | Status | Verified Test Suites |
| :--- | :--- | :--- | :--- | :--- |
| **FEAT-P0-BASELINE** | P0 | Reconnaissance & Architectural Baseline | `COMPLETED` | Architecture review & Master Plan |
| **FEAT-P1.1-DOMAIN** | P1.1 | 12 Core Domain Entities & Zod Schemas | `COMPLETED` | `tests/domain/*.test.ts` (14 suites, 37 tests) |
| **FEAT-P1.2-PERSISTENCE** | P1.2 | Native SQLite Engine, WAL, Repositories | `COMPLETED` | `tests/persistence/*.test.ts` (5 suites, 51 tests) |
| **FEAT-P1.3-EVENT-STATE** | P1.3 | EventStore, Reducers, Projections, Trees | `COMPLETED` | `tests/event-state/*.test.ts` (5 suites, 61 tests) |
| **FEAT-P1.4-CHECKPOINTS** | P1.4 | Checkpoint Manifests & Crash Recovery | `COMPLETED` | `tests/recovery/*.test.ts` (4 suites, 75 tests) |
| **FEAT-P1.5-RESUME** | P1.5 | Durable Runtime Session Resume (`/resume`) | `IN_PROGRESS` | `tests/resume/*.test.ts` (Pending) |
| **FEAT-P2.1-CONTENT** | P2.1 | Multimodal Ingestion (PDF, Audio, Media) | `PLANNED` | Pending P2 |
| **FEAT-P2.4-CONTEXT** | P2.4 | Context Planning & Token Budgeting | `PLANNED` | Pending P2 |
| **FEAT-P2.5-COMPACT** | P2.5 | Lossless Compaction & Memory Distillation | `PLANNED` | Pending P2 |
| **FEAT-P3.1-PROVIDERS** | P3.1 | Provider Adapters & Credential Pools | `PLANNED` | Pending P3 |
| **FEAT-P4.1-POLICY** | P4.1 | ToolGateway & Security Policy Engine | `PLANNED` | Pending P4 |
| **FEAT-P4.4-EXECUTORS** | P4.4 | Local, Docker & Sandboxed Executors | `PLANNED` | Pending P4 |
| **FEAT-P5.1-MCP** | P5.1 | Model Context Protocol Capability Adapter | `PLANNED` | Pending P5 |
| **FEAT-P6.1-AGENTS** | P6.1 | Agent Teams, Leases & Parallel Worktrees | `PLANNED` | Pending P6 |
| **FEAT-P7.1-WORKFLOW** | P7.1 | Durable DAG Workflows & Orchestration | `PLANNED` | Pending P7 |
| **FEAT-P8.1-CLI-TUI** | P8.1 | CLI, TUI, SDK & Real-Time Projections | `PLANNED` | Pending P8 |
| **FEAT-P9.1-HARDENING** | P9.1 | Production Hardening & Evaluation Suite | `PLANNED` | Pending P9 |
