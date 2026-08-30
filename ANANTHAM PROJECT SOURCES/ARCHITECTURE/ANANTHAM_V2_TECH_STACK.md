# Anantham V2 — Technology Stack

**Product:** Anantham V2  
**Architecture:** Local-first, provider-neutral, capability-based, policy-controlled, durable, event-sourced, extensible  
**Primary Runtime:** TypeScript + Node.js

---

## 1. Stack Overview

| Layer | Technology / Approach |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| Primary Storage | SQLite |
| Artifact Storage | Filesystem / object-store abstraction |
| State Model | Durable event-sourced state |
| Database Durability | SQLite transactions + WAL |
| Model Integration | Provider-neutral model adapters |
| Model Routing | Capability-aware `ModelRouter` |
| AI Providers | OpenRouter, OpenAI, Anthropic, Google/Gemini, DeepSeek, compatible/custom/local providers |
| Agent Runtime | Agents, subagents, teams, durable task board |
| Tool Runtime | `ToolGateway` + schema validation + policy |
| MCP | MCP client/registry/gateway adapter layer |
| Extensions | Plugins, Skills, Hooks |
| Execution | Local, Docker, remote executor abstraction |
| Parallel Code Work | Git worktrees |
| Orchestration | TypeScript workflow-as-code / task DAG |
| Context | Context Engine / `ContextPlan` |
| Memory | Scoped, provenance-aware memory |
| Verification | Objective verification + verification artifacts |
| API | HTTP, WebSocket, SSE, JSON-RPC |
| SDK | TypeScript SDK |
| Interfaces | CLI, TUI, API, SDK, headless |
| Integrations | REST, GraphQL, Webhooks, GitHub/GitLab/CI, SaaS connectors |
| Observability | Events, audit records, model/tool/agent execution journals |

---

## 2. High-Level Architecture

```text
                         ANANTHAM V2
                              |
              +---------------+---------------+
              |               |               |
          Model Plane     Agent Plane    Execution Plane
              |               |               |
       ProviderRouter      AgentRuntime     ToolGateway
       ModelAdapters       TaskBoard        MCPGateway
       KeyPools            AgentTeams       ExecutorPool
       CapabilityResolver  Orchestrator     PluginRuntime
              |               |               |
              +---------------+---------------+
                              |
                     Policy / Approval
                              |
                    Context / Memory
                              |
                       Verification
                              |
                     Event + Artifact
                              |
                           Storage
```

---

## 3. Core Runtime

### Language

**TypeScript**

TypeScript is the primary implementation language.

Engineering requirements:

- explicit domain types;
- discriminated unions;
- narrow interfaces;
- runtime validation at trust boundaries;
- typed errors;
- dependency injection where appropriate;
- avoid unsafe `any`/casts.

### Runtime

**Node.js**

Node.js is the primary execution runtime for the Anantham application and TypeScript SDK.

---

## 4. Persistence

### Primary Database

**SQLite**

SQLite stores durable runtime state.

The persistence architecture uses:

```text
SQLite
  |
  +-- authoritative events
  +-- task/session/project state
  +-- checkpoints
  +-- durable metadata
  +-- configuration/state required for recovery
```

### Database Durability

The engineering standard requires deliberate use of:

- transactions;
- WAL;
- appropriate synchronous durability;
- foreign keys;
- schema versions;
- migration tracking;
- integrity checks.

### Artifact Storage

Large or binary data uses:

```text
Filesystem / Object-store abstraction
```

Artifacts should use safe writes:

```text
temporary file
    ↓
write
    ↓
flush/fsync where required
    ↓
atomic rename
    ↓
metadata commit
```

SQLite and artifact storage are separate concerns.

---

## 5. Event-Sourced State

Anantham uses durable event-sourced state.

```text
Command
   ↓
Validate
   ↓
Transaction
   ↓
Append immutable event
   ↓
Durable commit
   ↓
Update projection
```

Rules:

- Events are immutable facts.
- Corrections create new events.
- Projections/indexes/caches are rebuildable.
- Critical state must survive restart.
- Compaction must not destroy authoritative history.

---

## 6. AI / Model Stack

### Provider-Neutral Model Layer

```text
ModelRouter
    ↓
CapabilityResolver
    ↓
ProviderAdapter
    ↓
ModelAdapter
    ↓
Provider API / Local Endpoint
```

The runtime must not depend directly on provider-specific semantics.

### Provider Targets

The PRD defines support for:

- OpenRouter;
- Direct DeepSeek;
- Direct OpenAI;
- Direct Anthropic;
- Direct Google/Gemini;
- OpenAI-compatible APIs;
- Anthropic-compatible APIs where technically valid;
- local endpoints;
- gateway endpoints;
- custom providers.

Provider-specific behavior belongs inside adapters.

### Model Capabilities

Capability resolution must account for:

```text
text input/output
image input/output
audio input/output
video input/output
document input
tool calling
parallel tool calls
structured output
JSON Schema
streaming
reasoning
computer use
web search
code execution
prompt caching
context window
maximum output tokens
```

---

## 7. Model Routing

`ModelRouter` selects a compatible model based on requirements and policy.

Routing can consider:

```text
task type
required capabilities
context size
latency
cost
provider health
key availability
data sensitivity
agent role
model profile
```

Example:

```text
Architecture → high-reasoning model
Simple edit → fast/cheap model
Vision → multimodal model
Review → independent reviewer
Large context → long-context model
Sensitive data → approved provider
```

Pricing or capabilities must never be invented when unavailable.

---

## 8. Credential / API Key Stack

Credentials are managed as protected resources.

```text
Provider
   ↓
Auth Profile
   ↓
Key Pool
   ↓
Key Scheduler
```

Raw credentials must not enter:

- SQLite normal records;
- model context;
- events;
- logs;
- artifacts;
- telemetry;
- crash reports.

Secure storage should use OS secret storage where available:

```text
Windows Credential Manager
macOS Keychain
Linux Secret Service
```

Environment variables may be used as a fallback.

---

## 9. Agent Runtime

Core concepts:

```text
Agent
Subagent
Agent Team
Task
Task Board
Agent Message
Agent Memory
Agent Handoff
```

Agents are bounded identities with:

```text
role
model
tools
skills
permissions
context
memory scope
budget
executor
task
```

### Task Board

Durable task states include:

```text
queued
available
claimed
running
blocked
waiting_approval
waiting_resource
review
verifying
completed
failed
cancelled
```

Task claiming uses leases where required.

---

## 10. Tool Stack

The Tool Gateway is the sole execution entry point for agent-selected tools.

```text
Agent
  ↓
ToolGateway
  ↓
Schema Validation
  ↓
Policy
  ↓
Approval
  ↓
Executor
  ↓
Observation
  ↓
Artifact / Event
```

A tool defines **what** should happen.

An executor defines **where/how** it happens.

Tool contracts include:

```text
name
description
input schema
risk
idempotency
timeout
capabilities
```

---

## 11. Native Tools

The V2 baseline includes capabilities such as:

```text
filesystem.read
filesystem.write
filesystem.list
filesystem.search
shell.execute
process.start
process.stop
process.logs
git.status
git.diff
git.branch
git.worktree
search
browser
task.delegate
artifact.create
memory.search
```

All tool execution remains policy-controlled.

---

## 12. MCP Stack

MCP is implemented as an adapter/capability layer.

```text
MCP Server
    ↓
MCP Client
    ↓
MCP Registry
    ↓
Capability Discovery
    ↓
Tool / Content Gateway
```

Supported capability classes include:

```text
tools
resources
prompts
roots
sampling where supported
authentication
lifecycle
```

MCP tools are normalized into Anantham `ToolDefinition` contracts and therefore pass through global policy.

MCP resources become `ContentObject` instances or references where applicable.

MCP output is untrusted external content.

---

## 13. Plugin Stack

Plugin classes include:

```text
model-provider
tool
skill
agent
executor
verifier
memory-provider
MCP-adapter
command
hook
UI
scheduler
connector
```

Plugin lifecycle:

```text
discover
 ↓
inspect
 ↓
validate
 ↓
dependency resolution
 ↓
permission review
 ↓
install
 ↓
verify
 ↓
activate
 ↓
health
```

Plugins must be versioned and compatible with the runtime.

Plugin trust must track:

```text
publisher/source
version
checksum
permissions
network
filesystem
credentials
trust state
```

---

## 14. Skills

Skills represent procedural knowledge.

```text
Memory = what is known
Skill  = how a task should be performed
```

Skills use a versioned, progressively loaded format such as `SKILL.md`.

Loading:

```text
Skill metadata
    ↓
Relevance match
    ↓
Full skill body
    ↓
Required tools
```

Historical executions record the exact skill version.

---

## 15. Hooks

Hooks are deterministic lifecycle automation.

Examples:

```text
SessionStart
SessionResume
BeforeModel
AfterModel
ModelError
BeforeTool
AfterTool
ToolError
BeforeEdit
AfterEdit
BeforeCommand
AfterCommand
BeforeMCP
AfterMCP
BeforeAgent
AfterAgent
BeforeCompaction
AfterCompaction
BeforeVerification
AfterVerification
BeforeCommit
BeforePush
BeforeDeploy
```

Hooks cannot bypass global policy.

Security-sensitive hooks should fail closed where practical.

---

## 16. Execution Stack

Executor abstraction:

```text
Executor
   |
   +-- Local
   +-- Docker
   +-- SSH
   +-- Remote VM
   +-- Cloud
   +-- Serverless
```

The V2 requirements explicitly identify local, Docker and remote execution as important execution targets.

### Execution Specification

```text
command
cwd
environment
network policy
filesystem permissions
timeout
memory limit
CPU limit
process limit
```

### Docker

Docker is the stronger isolation target for untrusted tasks where supported.

Never silently downgrade from a stronger sandbox to weaker execution.

---

## 17. Git / Parallel Development

Parallel code-writing agents should use isolated Git worktrees.

```text
main
 ├── worktree-agent-A
 ├── worktree-agent-B
 └── worktree-review
```

Before editing:

```text
read current state
 ↓
capture base hash
 ↓
prepare diff
 ↓
policy
 ↓
apply
 ↓
diagnostics
 ↓
tests
```

If the file changed after the agent's base revision:

```text
stop
 ↓
re-read
 ↓
reconcile / rebase / ask
```

Never silently overwrite user changes.

---

## 18. Workflow / Orchestration Stack

Workflows are executable TypeScript.

Core concepts:

```text
defineWorkflow()
task()
parallel()
dependsOn()
condition()
foreach()
artifact()
verify()
approve()
retry()
timeout()
budget()
model()
keyPool()
executor()
```

Execution model:

```text
Workflow
   ↓
Task DAG
   ↓
Validation
   ↓
Dependency Resolution
   ↓
Policy / Capability / Resource Checks
   ↓
Orchestration
   ↓
Verification
```

Workflow runs pin relevant versions:

```text
workflow
plugins
skills
agents
model profile
tool schemas
executor configuration
policy revision
```

Active runs must not silently change semantics because definitions changed.

---

## 19. Context / Memory Stack

The architecture deliberately separates:

```text
History ≠ Memory ≠ Context ≠ Artifact
```

### Context Engine

Uses `ContextPlan` to select relevant:

```text
project context
task context
session history
memory
files
attachments
artifacts
skills
tools
diagnostics
```

Selection should consider:

```text
relevance
provenance
capability
token budget
security
representation
```

### Progressive Disclosure

Do not inject entire:

```text
repositories
histories
memories
tool inventories
skills
attachments
```

into every model request.

Large outputs should become artifacts and references.

---

## 20. Multimodal Content

Supported content may include:

```text
text
image
PDF
DOCX
XLSX
CSV
audio
video
ZIP
unknown binary
```

Processing:

```text
Input
 ↓
Validation
 ↓
Security Classification
 ↓
Extraction
 ↓
Representation
 ↓
Provenance
 ↓
ContextPlan
 ↓
Model Capability Resolution
 ↓
Model
```

Unknown binary data should be preserved safely rather than silently discarded.

---

## 21. Security Stack

Security is enforced above model output and external content.

```text
Model / External Content
          ↓
       Runtime
          ↓
      Policy Engine
          ↓
       Approval
          ↓
       Execution
```

Core principles:

- Model output cannot grant permissions.
- MCP/plugins/skills/workflows cannot bypass policy.
- Credentials remain references.
- External content is untrusted data.
- High-risk actions require applicable risk classification, policy, approval, audit and verification.
- Sandbox boundaries cannot be silently weakened.
- Project isolation is enforced by default.

---

## 22. Verification Stack

Model claims are not evidence.

Verification uses objective signals:

```text
tests
build
lint
typecheck
diff inspection
schema validation
artifact validation
deployment health
security checks
external-state verification
```

Major workflows should produce artifacts such as:

```text
plan
change
test
review
verification
```

---

## 23. Recovery Stack

Recovery is built around durable state.

```text
Failure
  ↓
Persist Evidence
  ↓
Classify Failure
  ↓
Checkpoint / Durable State
  ↓
Restart
  ↓
Reconstruct State
  ↓
Rebuild Derived Data
  ↓
Resume
  ↓
Verify
```

Recovery must preserve:

```text
events
checkpoints
artifacts
task state
workflow state
approvals
memory
worktree state
relevant configuration
```

`/resume` reconstructs durable runtime state; it is not merely chat replay.

---

## 24. API / Interface Stack

All interfaces operate against the same runtime.

```text
                    Runtime
                       |
       +---------------+---------------+
       |       |       |       |       |
      CLI     TUI     HTTP   WebSocket  SSE
                       |
                   JSON-RPC
                       |
                TypeScript SDK
                       |
                  Headless / CI
```

Machine-readable modes include:

```text
--json
--jsonl
--quiet
--no-color
```

Headless execution must never require an interactive TUI prompt.

---

## 25. External Integration Stack

Connector abstractions support:

```text
REST
GraphQL
MCP
Webhook
Database
SaaS
Browser
Custom SDK
```

Potential integrations include:

```text
GitHub
GitLab
Bitbucket
Slack
Discord
Linear
Jira
Notion
Google Drive
PostgreSQL
Supabase
custom APIs
```

Connectors are separate from tools:

```text
Connector = how to communicate
Tool      = operation exposed to agents
```

---

## 26. Code Intelligence Stack

The planned code-intelligence layer includes:

```text
Source Files
    ↓
Parsing / AST
    ↓
Symbols
    ↓
Dependency Relationships
    ↓
LSP
    ↓
Diagnostics
    ↓
Git Intelligence
    ↓
Incremental Indexing
    ↓
Semantic Search
```

This layer feeds repository understanding, retrieval and agent context.

---

## 27. Observability Stack

Important executions record:

```text
request ID
project
session
task
agent
provider
model
key/auth profile
tool
executor
workflow
duration
status
artifact
```

Tool execution journals record:

```text
normalized arguments
policy result
approval
start/end
exit code
stdout artifact
stderr artifact
result
retryability
```

Secrets must never appear in observability data.

---

## 28. Resource Governance

Resource limits are centrally enforced.

Resources include:

```text
agents
requests
tokens
cost
CPU
memory
disk
network
keys
executors
```

Limits can exist at:

```text
global
project
workflow
task
agent
request
```

Lower layers cannot exceed global hard limits.

---

## 29. Testing Stack

Required testing categories depend on the feature:

```text
Functional
Failure / Timeout
Persistence / Restart
Crash / Recovery
Concurrency
Security
Contracts / Migrations
End-to-End
Evaluation
Performance
```

Foundational infrastructure must demonstrate restart/recovery.

Important failure tests include:

```text
provider failure
key exhaustion
MCP failure
executor failure
agent crash
heartbeat loss
context failure
policy denial
sandbox failure
parallel write conflict
```

---

## 30. Architecture Principles

The technology choices support these architectural principles:

```text
Local-first
Provider-neutral
Capability-based
Policy-controlled
Durable
Event-sourced
Recoverable
Artifact-backed
Observable
Extensible
Secure-by-default
```

The central boundary remains:

```text
MODEL = reason / interpret / plan / propose

RUNTIME = state / context / policy / tools / agents /
          orchestration / memory / artifacts /
          checkpoints / resources / verification / recovery
```

The runtime—not the model—is the authority.

---

## 31. Implementation Priority

The engineering playbook recommends building foundational infrastructure before presentation:

```text
1. Durable state
2. Project / Session / Task
3. Events / Checkpoints
4. Content / Artifacts
5. Storage / Recovery
6. Model / Provider
7. Context / Retrieval
8. Policy / Tools
9. Memory
10. MCP / Plugins / Skills / Hooks
11. Agents
12. Teams
13. Executors
14. Orchestration
15. Verification
16. CLI / TUI
17. External Integrations
18. Evaluation
19. Production Hardening
```

Do not build a polished UI around unstable runtime primitives.

---

## 32. Technology Stack Summary

```text
┌──────────────────────────────────────────────────────┐
│                    INTERFACES                        │
│ CLI · TUI · HTTP · WebSocket · SSE · JSON-RPC · SDK│
├──────────────────────────────────────────────────────┤
│                 APPLICATION LAYER                   │
│ Tasks · Agents · Teams · Workflows · Approvals      │
├──────────────────────────────────────────────────────┤
│                  RUNTIME SERVICES                    │
│ ModelRouter · Context · Memory · Policy · Tools     │
│ MCP · Plugins · Skills · Hooks · Verification      │
├──────────────────────────────────────────────────────┤
│                  EXECUTION LAYER                     │
│ Local · Docker · Remote · Git Worktrees             │
├──────────────────────────────────────────────────────┤
│                 PROVIDER / CONNECTORS                │
│ OpenRouter · OpenAI · Anthropic · Gemini ·          │
│ DeepSeek · Compatible APIs · MCP · REST · GraphQL   │
├──────────────────────────────────────────────────────┤
│                   DOMAIN / STATE                     │
│ Event Log · Tasks · Sessions · Projects · Checkpoints│
├──────────────────────────────────────────────────────┤
│                    STORAGE                           │
│ SQLite · Filesystem/Object Store                    │
└──────────────────────────────────────────────────────┘
```

---

## Source Authority

This document is a stack-level summary derived from:

- `ANANTHAM_PRD_V2_PART_1_PRODUCT_AND_ARCHITECTURE.md`
- `ANANTHAM_PRD_V2_PART_2_AGENTS_INTEGRATIONS_AND_EXECUTION.md`
- `ANANTHAM_PRD_V2_PART_3_CLI_SECURITY_UX_EVALUATION_IMPLEMENTATION.md`
- `00_ANANTHAM_ENGINEERING_PLAYBOOK.md`

Where a concrete library/framework is not specified by the authoritative sources, this document intentionally does **not** invent one. Concrete implementation choices should be established through repository inspection and, where material, an ADR.
