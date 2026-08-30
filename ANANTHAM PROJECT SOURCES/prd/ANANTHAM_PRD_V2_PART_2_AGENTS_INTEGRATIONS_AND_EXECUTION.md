# ANANTHAM PRD V2 — PART 2
## Models, Providers, API Keys, Tools, MCP, Plugins, Skills, Hooks, Agents, Teams, Parallel Execution, Remote Execution and Orchestration

**Product:** Anantham  
**Version:** 2.0 — Part 2 of 3  
**Status:** Production Requirements Specification  
**Date:** 2026-08-30  
**Depends on:** `ANANTHAM_PRD_V2_PART_1_PRODUCT_AND_ARCHITECTURE.md`  
**Primary runtime:** TypeScript + Node.js  
**Architecture:** Provider-neutral, capability-based, policy-controlled, durable, extensible

---

# 1. DOCUMENT CONTROL

## 1.1 Purpose

Part 2 defines the operational platform that executes the durable project/session/task/content architecture defined in Part 1.

It is authoritative for:

- model adapters;
- provider adapters;
- model capability negotiation;
- OpenRouter;
- direct/custom providers;
- API-key pools;
- concurrency and rate limiting;
- model routing;
- agent roles;
- subagents;
- agent teams;
- task board;
- agent messaging;
- tools;
- tool gateway;
- tool schema loading;
- MCP;
- MCP resources/prompts/tools;
- MCP authentication/lifecycle;
- plugins;
- skills;
- hooks;
- executors;
- local execution;
- sandbox;
- Docker;
- remote/background execution;
- worktrees;
- parallel agent safety;
- workflow-as-code;
- orchestration;
- external API connectors;
- GitHub/GitLab/CI integrations;
- notifications;
- SDK/RPC/headless operation.

## 1.2 Contract with Part 1

Part 2 MUST use, and MUST NOT redefine incompatibly:

```text
Project
Session
Task
HarnessEvent
Checkpoint
ContentObject
Attachment
Artifact
MemoryItem
ContextPlan
Provenance
SecurityMetadata
```

The event-sourced durability model from Part 1 remains authoritative.

---

# 2. OPERATIONAL ARCHITECTURE

```text
                         ANANTHAM CONTROL PLANE
                                  |
             +--------------------+--------------------+
             |                    |                    |
        Model Plane          Agent Plane          Execution Plane
             |                    |                    |
       ProviderRouter         AgentRegistry        ToolGateway
       ModelAdapters          AgentRuntime         MCPGateway
       KeyPools               TaskBoard            PluginRuntime
       CapabilityResolver     AgentTeams           ExecutorPool
             |                    |                    |
             +--------------------+--------------------+
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

# 3. MODEL ABSTRACTION

## PRD-MODEL-001

All model access MUST occur through a provider-neutral adapter.

```ts
interface ModelAdapter {
  readonly providerId: string;
  readonly modelId: string;

  capabilities(): ModelCapabilities;

  generate(
    request: ModelRequest,
    signal?: AbortSignal
  ): Promise<ModelResult>;

  stream(
    request: ModelRequest,
    signal?: AbortSignal
  ): AsyncIterable<ModelEvent>;

  estimateCost?(
    request: ModelRequest
  ): Promise<CostEstimate>;
}
```

---

# 4. MODEL CAPABILITY MATRIX

Model metadata MUST support:

```text
textInput
imageInput
audioInput
videoInput
documentInput

textOutput
imageOutput
audioOutput
videoOutput

toolCalling
parallelToolCalls
structuredOutput
jsonSchema
streaming
reasoning
computerUse
webSearch
codeExecution
promptCaching

contextWindow
maxOutputTokens
```

Capability declarations MUST be runtime-checked.

---

# 5. CONTENT NEGOTIATION

Before model execution:

```text
Task
  |
Attachments
  |
ContextPlan
  |
Required capabilities
  |
Model capability resolver
  |
compatible?
 /        \
yes       no
 |         |
run       transform / fallback / ask
```

The system MUST NOT submit unsupported modalities to a provider merely because the input is available locally.

---

# 6. PROVIDER ABSTRACTION

```ts
interface ProviderAdapter {
  readonly id: string;

  capabilities(): ProviderCapabilities;

  listModels(): Promise<ModelInfo[]>;

  validateConfiguration(): Promise<HealthStatus>;

  createModelAdapter(
    modelId: string
  ): Promise<ModelAdapter>;
}
```

A provider may expose many models and many credentials.

---

# 7. PROVIDER CLASSES

Anantham MUST support:

1. OpenRouter
2. Direct DeepSeek
3. Direct OpenAI
4. Direct Anthropic
5. Direct Google/Gemini
6. OpenAI-compatible APIs
7. Anthropic-compatible APIs where technically valid
8. Local endpoints
9. Gateway endpoints
10. Custom providers

Provider-specific behavior stays inside adapters.

---

# 8. OPENROUTER

OpenRouter MUST be a first-class provider adapter.

Example:

```text
OpenRouterAdapter
    |
    +-- model-A
    +-- model-B
    +-- model-C
```

The rest of the runtime sees:

```text
ModelAdapter
```

not OpenRouter-specific API semantics.

---

# 9. CUSTOM PROVIDER

Users MUST be able to define a provider using:

```json
{
  "id": "my-provider",
  "baseUrl": "https://api.example.com/v1",
  "protocol": "openai-compatible",
  "authProfile": "my-account",
  "models": [
    {
      "id": "my-model",
      "contextWindow": 128000,
      "capabilities": {
        "toolCalling": true,
        "structuredOutput": true,
        "vision": false
      }
    }
  ]
}
```

Future request/response transformation plugins MUST be supported.

---

# 10. MODEL PROFILES

Model selection MUST support named profiles.

Example:

```json
{
  "name": "balanced",
  "planner": "openrouter/model-planner",
  "coder": "openrouter/model-coder",
  "reviewer": "anthropic/model-review",
  "vision": "google/model-vision",
  "verifier": "local/model-verifier"
}
```

---

# 11. ROUTING POLICY

Routing considers:

```text
task type
required capabilities
context size
latency
cost
provider health
key availability
data sensitivity
user-selected profile
agent role
```

Example:

```text
architecture -> high reasoning
simple edit -> fast/cheap
vision -> multimodal
review -> independent model
large context -> long-context
sensitive data -> approved provider
```

---

# 12. ROUTER INTERFACE

```ts
interface ModelRouter {
  resolve(
    requirements: ModelRequirements,
    policy: RoutingPolicy
  ): Promise<ModelRoute>;
}
```

---

# 13. MODEL ROUTE

```ts
interface ModelRoute {
  providerId: string;
  modelId: string;
  authProfileId: string;
  keyPoolId: string;

  capabilities: ModelCapabilities;

  limits: {
    contextWindow: number;
    maxOutputTokens?: number;
  };
}
```

---

# 14. PROVIDER HEALTH

Provider state:

```text
healthy
degraded
rate-limited
unavailable
misconfigured
disabled
```

Health is maintained independently for:

- provider;
- model;
- credential;
- API key.

---

# 15. API KEY POOLS

## PRD-AUTH-001

Anantham MUST allow multiple credentials per provider.

A key pool includes:

```text
provider
auth profile
key IDs
enabled keys
max active keys
max requests/key
concurrency/key
rate limits
health
cooldown
usage
```

---

# 16. SECURE KEY STORAGE

Raw keys MUST NOT be stored in normal SQLite records.

Store:

```text
credential reference
provider
masked fingerprint
createdAt
lastUsedAt
status
```

Credentials should use OS secret storage:

```text
Windows Credential Manager
macOS Keychain
Linux Secret Service
```

Environment variables may be a fallback.

---

# 17. API KEY COMMANDS

```text
/api
/api providers
/api add
/api remove <provider>

/api keys
/api key add <provider>
/api key remove <id>
/api key enable <id>
/api key disable <id>

/api pool <provider>
/api concurrency <n>
/api test <provider>
/api usage
/api limits
```

---

# 18. AUTH PROFILES

One provider may contain:

```text
OpenRouter/work
OpenRouter/personal
OpenAI/lab
OpenAI/company
```

Models and workflows can select an auth profile rather than a raw credential.

---

# 19. API KEY SCHEDULER

Selection algorithm:

```text
eligible keys
   |
remove cooldown keys
   |
remove disabled keys
   |
remove capacity-full keys
   |
filter provider/model compatibility
   |
rank by:
  health
  remaining capacity
  observed rate-limit headroom
  latency
  fairness
   |
select
```

---

# 20. FAIRNESS

The scheduler MUST avoid starving keys.

It should use:

- weighted fair scheduling;
- capacity-aware selection;
- usage counters.

Round-robin may be used as a fallback but is not sufficient as the only strategy.

---

# 21. CONCURRENCY

User controls:

```text
global maximum agents
global maximum requests
provider concurrency
key concurrency
workflow concurrency
project concurrency
```

Hard global limits always win.

---

# 22. RATE LIMIT HANDLING

Provider adapters should expose observed/declared:

```text
requests/min
tokens/min
concurrent requests
Retry-After
```

On 429:

```text
pause key
respect Retry-After
requeue task when safe
```

---

# 23. KEY QUARANTINE

A key may become:

```text
healthy
suspect
cooldown
quarantined
disabled
```

Repeated authentication failures MUST NOT result in endless retries.

---

# 24. SAFE FAILOVER

Failover may be performed for:

- timeout;
- transport failure;
- 429;
- 5xx;
- provider unavailable.

For side-effecting actions, retries require idempotency knowledge.

---

# 25. IDEMPOTENCY

Every tool call SHOULD declare:

```text
idempotent
non-idempotent
unknown
```

Unknown operations must use conservative retry policy.

---

# 26. MODEL REQUEST IDEMPOTENCY

Pure model generation is normally safe to retry.

Tool execution is NOT automatically safe to retry.

The runtime MUST distinguish:

```text
model retry
```

from:

```text
side-effect retry
```

---

# 27. MODEL REQUEST LOGGING

Record:

```text
requestId
provider
model
auth profile
masked key ID
task
agent
context revision
attachment IDs
input token estimate
output token usage
latency
finish status
```

Secret material MUST be redacted.

---

# 28. AGENT MODEL

```ts
interface AgentRole {
  id: string;
  description: string;

  systemPrompt: string;

  allowedTools: string[];
  allowedMcps: string[];
  requiredSkills: string[];

  permissionProfile: string;
  modelProfile: string;

  maxIterations: number;

  budget: {
    maxTokens?: number;
    maxCostUsd?: number;
    maxWallClockMs: number;
    maxToolCalls?: number;
  };
}
```

---

# 29. BUILT-IN AGENTS

Anantham SHOULD ship with:

```text
planner
researcher
implementer
debugger
reviewer
verifier
security-reviewer
architecture-reviewer
performance-reviewer
test-engineer
integrator
release
```

---

# 30. AGENT CAPABILITY REQUIREMENTS

Each role can declare:

```text
requiredCapabilities:
  - toolCalling
  - structuredOutput
  - vision
```

The resolver MUST reject invalid combinations before runtime start.

---

# 31. SUBAGENT MODEL

A subagent is a child task:

```text
Parent Task
   |
Child Task
   |
AgentRole
   |
Context subset
   |
Tools/skills
   |
Result artifact
```

---

# 32. AGENT HANDOFF

Child output MUST use structured handoff:

```json
{
  "status": "success",
  "summary": "...",
  "findings": [],
  "changedFiles": [],
  "artifacts": [],
  "unresolved": [],
  "recommendedNextActions": []
}
```

---

# 33. AGENT MEMORY

Agent memory is scoped:

```text
agent/<agent-id>/<project-id>
```

Agent memory is not automatically global.

---

# 34. TASK BOARD

Anantham MUST have a durable task board.

Task states:

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

---

# 35. TASK CLAIMING

An agent claims a task with a lease:

```text
taskId
agentId
leaseId
claimedAt
expiresAt
```

Only the current lease holder may mutate the claimed task.

---

# 36. AGENT HEARTBEAT

Running agents MUST emit heartbeats.

Minimum:

```text
agentId
taskId
timestamp
current action
last tool
last model request
```

A missed heartbeat may mark the agent stalled.

---

# 37. STALLED AGENT RECOVERY

```text
heartbeat timeout
 |
inspect process
 |
alive?
 / \
yes no
 |   |
extend   requeue
```

The runtime MUST avoid duplicate execution.

---

# 38. PAUSE/RESUME AGENT

An individual agent must support:

```text
pause
resume
cancel
steer
```

without necessarily terminating the parent task.

---

# 39. AGENT TEAMS

An agent team is distinct from a simple collection of subagents.

A team has:

```text
team coordinator
shared task board
agent identities
peer messaging
shared artifacts
task claiming
team lifecycle
```

---

# 40. TEAM ARCHITECTURE

```text
                 TEAM
                  |
            Task Board
                  |
       +----------+----------+
       |          |          |
    Agent A    Agent B    Agent C
       |          |          |
       +---- Message Bus ----+
                  |
             Artifacts
                  |
              Coordinator
```

---

# 41. TEAM COMMANDS

```text
/teams
/teams create <name>
/teams list
/teams status <name>
/teams tasks <name>
/teams message <agent>
/teams stop <name>
```

---

# 42. PEER MESSAGE PROTOCOL

```ts
interface AgentMessage {
  id: string;
  teamId: string;
  senderAgentId: string;
  receiverAgentId?: string;

  type:
    | "info"
    | "request"
    | "response"
    | "blocker"
    | "handoff"
    | "challenge"
    | "resource";

  payload: Record<string, unknown>;
}
```

---

# 43. TEAM SAFETY

Teams MUST be bounded by:

```text
max agents
max messages
max task depth
max cost
max time
max tools
```

Agents cannot spawn unlimited descendants.

---

# 44. AGENT PRIORITY

Task scheduler uses:

```text
task priority
dependency readiness
deadline
resource availability
agent capability
```

---

# 45. TOOL GATEWAY

The Tool Gateway is the sole execution entry point for agent-selected tools.

```text
Agent decision
      |
Tool Gateway
      |
Schema validation
      |
Policy
      |
Approval
      |
Executor
      |
Observation
      |
Artifact/event
```

---

# 46. TOOL CONTRACT

```ts
interface ToolDefinition {
  name: string;
  description: string;

  inputSchema: JsonSchema;

  risk:
    | "read"
    | "write"
    | "execute"
    | "network"
    | "git"
    | "deploy"
    | "secrets";

  idempotency:
    | "idempotent"
    | "non-idempotent"
    | "unknown";

  timeoutMs: number;

  capabilities?: string[];
}
```

---

# 47. TOOL EXECUTION CONTEXT

Tool calls receive:

```text
project
session
task
agent
permissions
workspace
credential references
execution target
network policy
```

---

# 48. TOOL RESULT

```ts
interface ToolResult {
  success: boolean;

  summary: string;

  rawArtifactId?: string;

  output:
    | TextOutput
    | StructuredOutput
    | ContentObject[];

  exitCode?: number;

  retryable: boolean;

  provenance: Provenance;
}
```

---

# 49. TOOL RESULT SIZE POLICY

If output exceeds a configurable threshold:

```text
raw output
  -> artifact
  -> summarize
  -> context
```

The raw output remains retrievable.

---

# 50. DEFERRED TOOL SCHEMAS

Anantham MUST support:

```text
tool catalog
   |
short metadata
   |
model selects tool
   |
full schema loaded
   |
execution
```

This prevents large MCP/tool inventories from consuming the entire context.

---

# 51. TOOL SEARCH

```text
/tools
/tools search <query>
/tools inspect <name>
/tools schema <name>
/tools enable <name>
/tools disable <name>
```

---

# 52. TOOL GROUPS

Group tools by:

```text
filesystem
shell
git
browser
database
web
MCP
memory
agents
artifacts
research
```

---

# 53. NATIVE TOOLS

V2 baseline:

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

---

# 54. MCP ARCHITECTURE

MCP MUST be implemented as an adapter layer to the Tool/Content system.

```text
MCP Server
   |
MCP Client
   |
MCP Registry
   |
Capability Discovery
   |
Tool Gateway / Resource Gateway
```

---

# 55. MCP CAPABILITY CLASSES

Support:

```text
tools
resources
prompts
roots
sampling where supported
authentication
```

---

# 56. MCP SERVER RECORD

```json
{
  "id": "mcp-playwright",
  "name": "Playwright",
  "transport": "stdio",
  "enabled": true,
  "trust": "user-approved",
  "tools": [],
  "resources": [],
  "prompts": [],
  "authProfile": null,
  "health": "healthy"
}
```

---

# 57. MCP COMMANDS

```text
/mcps
/mcps list
/mcps add <name>
/mcps remove <name>
/mcps enable <name>
/mcps disable <name>
/mcps restart <name>
/mcps auth <name>
/mcps tools <name>
/mcps resources <name>
/mcps prompts <name>
/mcps schema <name>
/mcps inspect <name>
/mcps health
```

---

# 58. MCP TRANSPORTS

Adapters should support, subject to protocol/version:

```text
stdio
Streamable HTTP
SSE where applicable
```

---

# 59. MCP AUTH

Support:

```text
environment credentials
OAuth where supported
API-key references
credential profiles
```

Authentication tokens must never become normal model context.

---

# 60. MCP RESOURCE HANDLING

MCP resources become `ContentObject` or resource references.

Flow:

```text
MCP resource
 |
content validation
 |
provenance
 |
representation
 |
Context Engine
```

---

# 61. MCP PROMPTS

MCP-provided prompts must remain distinguishable from user/system instructions.

They are not automatically authoritative.

---

# 62. MCP TOOL POLICY

Every discovered MCP tool is normalized into:

```text
ToolDefinition
```

Therefore global policy applies to it exactly like a native tool.

---

# 63. MCP HEALTH

Server health:

```text
starting
healthy
degraded
unhealthy
disconnected
disabled
```

Repeated failures should trip a circuit breaker.

---

# 64. MCP CIRCUIT BREAKER

```text
healthy
   |
failure threshold
   v
open
   |
cooldown
   v
half-open
   |
success -> healthy
failure -> open
```

---

# 65. REQUIRED MCP COMPATIBILITY TARGETS

Anantham must be capable of integrating compatible MCP servers such as:

```text
Playwright
Puppeteer
Neo4j
Chrome DevTools
```

Their own versions, commands and auth requirements remain external concerns.

---

# 66. PLUGIN RUNTIME

Plugin classes:

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

---

# 67. PLUGIN MANIFEST

```json
{
  "id": "example.plugin",
  "version": "1.0.0",
  "runtime": "anantham>=2.0",
  "provides": [
    "tool:example.search"
  ],
  "requires": [],
  "permissions": {
    "network": ["api.example.com"]
  },
  "checksum": "..."
}
```

---

# 68. PLUGIN LIFECYCLE

```text
discover
 |
inspect
 |
validate
 |
dependency resolution
 |
permission review
 |
install
 |
verify
 |
activate
 |
health
```

---

# 69. PLUGIN COMMANDS

```text
/plugins
/plugins list
/plugins add <source>
/plugins remove <name>
/plugins enable <name>
/plugins disable <name>
/plugins update
/plugins inspect <name>
/plugins reload
/plugins doctor
```

---

# 70. PLUGIN TRUST

Plugin states:

```text
unknown
reviewed
trusted
restricted
blocked
```

Every plugin must display:

```text
publisher/source
version
checksum
permissions
tools
network
filesystem
credentials
```

---

# 71. PLUGIN UNLOAD

Disabling a plugin must remove:

- commands;
- tools;
- hooks;
- providers;
- skills;
- MCP registrations;

without leaving stale references.

---

# 72. PLUGIN VERSION PINNING

Projects may lock plugin versions.

Example:

```json
{
  "plugin.example": "1.4.2"
}
```

---

# 73. PLUGIN COMPATIBILITY

Plugin compatibility checks:

```text
runtime version
OS
Node version
required capabilities
required other plugins
```

---

# 74. AGENT PLUGIN INTEROPERABILITY

Where technically and legally appropriate, Anantham should support the emerging vendor-neutral **Agent Plugins** packaging model that combines skills and MCP-style capabilities.

Anantham's richer manifest can coexist with the interoperable format.

---

# 75. SKILLS

Skills are procedural knowledge.

Memory answers:

> "What is known?"

Skills answer:

> "How should this task be performed?"

---

# 76. SKILL FORMAT

```yaml
---
name: software-testing
description: Run and interpret project tests.
version: 1.0.0
tools:
  - shell.execute
  - filesystem.read
---

# Software Testing

## Preconditions
Dependencies are installed.

## Procedure
1. Detect test runner.
2. Run focused tests.
3. Run broader tests where required.
4. Record evidence.

## Success criteria
Required tests pass.
```

---

# 77. SKILL LOADING

Use progressive disclosure:

```text
skill metadata
   |
relevance match
   |
full skill body
   |
required tools
```

Do not inject every skill into every context.

---

# 78. SKILL DEPENDENCIES

Skills may require:

```text
tools
MCP
other skills
model capabilities
runtime version
```

The registry validates these dependencies.

---

# 79. SKILL COMMANDS

```text
/skills
/skills list
/skills install <source>
/skills remove <name>
/skills enable <name>
/skills disable <name>
/skills reload
/skills inspect <name>
/skills test <name>
```

---

# 80. SKILL TESTING

Skills SHOULD contain deterministic fixtures.

Example:

```text
input project
expected commands
expected artifacts
expected verification
```

---

# 81. SKILL VERSIONING

Skill execution must record the exact skill version.

A historical task can therefore be reconstructed accurately.

---

# 82. SKILL LEARNING

An optional skill-improvement pipeline:

```text
repeated workflow
 |
candidate procedure
 |
generate skill draft
 |
tests
 |
human approval
 |
version
```

No auto-publishing by default.

---

# 83. HOOK SYSTEM

Hooks are deterministic lifecycle automation.

They are different from skills.

---

# 84. HOOK EVENTS

```text
SessionStart
SessionResume
SessionEnd

PromptSubmit

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
BeforeSubagent
AfterSubagent

BeforeCompaction
AfterCompaction

BeforeVerification
AfterVerification

BeforeCommit
BeforePush
BeforeDeploy
```

---

# 85. HOOK ACTIONS

A hook may:

- allow;
- deny;
- modify structured request;
- add context;
- create artifact;
- call external API;
- execute safe shell;
- notify;
- create child task.

Hooks cannot bypass global security policy.

---

# 86. HOOK CONFIGURATION

```json
{
  "event": "BeforePush",
  "action": {
    "type": "command",
    "command": "npm test"
  },
  "policy": {
    "onFailure": "block"
  }
}
```

---

# 87. HOOK ERROR POLICY

Hooks declare:

```text
fail-open
fail-closed
warn
```

Security-sensitive hooks MUST be fail-closed where practical.

---

# 88. EXECUTION PLANE

Executors convert tool/workflow actions into actual processes.

Executor types:

```text
local
docker
ssh
remote-vm
cloud
serverless
```

---

# 89. EXECUTOR INTERFACE

```ts
interface Executor {
  id: string;

  capabilities(): ExecutorCapabilities;

  run(
    spec: ExecutionSpec,
    signal?: AbortSignal
  ): Promise<ExecutionResult>;

  cancel?(
    executionId: string
  ): Promise<void>;
}
```

---

# 90. EXECUTION SPEC

```ts
interface ExecutionSpec {
  command: string;
  cwd: string;
  env: Record<string, string>;

  network:
    | "none"
    | "restricted"
    | "full";

  filesystem: {
    read: string[];
    write: string[];
  };

  limits: {
    timeoutMs: number;
    memoryMb?: number;
    cpuSeconds?: number;
    pids?: number;
  };
}
```

---

# 91. LOCAL EXECUTOR

Local execution is intended for trusted development.

It still passes through:

```text
policy
filesystem boundaries
timeouts
audit
```

---

# 92. DOCKER EXECUTOR

Docker is the default stronger isolation target for untrusted tasks.

Container configuration should support:

- image;
- CPU;
- memory;
- network;
- mounted directories;
- read-only directories;
- environment.

---

# 93. REMOTE EXECUTOR

Future-ready interface:

```text
Anantham
 |
Remote Executor
 |
remote environment
 |
agent task
```

Remote execution must have the same Task/Artifact/Event semantics as local execution.

---

# 94. ENVIRONMENT DEFINITION

```json
{
  "runtime": {
    "node": "22",
    "pnpm": "10"
  },
  "install": "pnpm install",
  "build": "pnpm build",
  "test": "pnpm test",
  "dev": "pnpm dev",
  "services": [
    {
      "name": "postgres",
      "image": "postgres:17"
    }
  ]
}
```

---

# 95. PROJECT ENVIRONMENT BOOTSTRAP

On project registration:

```text
detect runtime
detect package manager
detect test
detect build
detect lint
detect CI
detect Docker
detect dev server
```

Build a project environment profile.

---

# 96. REMOTE/BACKGROUND AGENTS

A background agent continues independently of the foreground interaction.

It must have:

```text
task
agent
project
execution target
budget
checkpoint policy
notification policy
```

---

# 97. BACKGROUND AGENT COMMANDS

```text
/agents start
/agents stop <id>
/agents pause <id>
/agents resume <id>
/agents inspect <id>
/agents background
```

---

# 98. BACKGROUND AGENT FOLLOW-UP

User can add a follow-up without discarding history:

```text
task
 |
agent inbox
 |
new steering event
 |
next admitted turn
```

---

# 99. REMOTE TASK RECOVERY

If remote environment disappears:

```text
detect environment failure
 |
persist task state
 |
restore/recreate environment if possible
 |
resume from checkpoint
```

---

# 100. GIT WORKTREES

Parallel code-writing agents SHOULD use Git worktrees.

```text
main
 |
 +-- worktree-agent-A
 +-- worktree-agent-B
 +-- worktree-review
```

---

# 101. WORKTREE RECORD

```ts
interface Worktree {
  id: string;
  projectId: string;
  taskId: string;
  path: string;
  branch: string;
  baseCommit: string;
  status: "active" | "merged" | "abandoned";
}
```

---

# 102. PARALLEL FILE CONFLICT

Before task launch:

```text
readSet
writeSet
```

If overlapping writes:

```text
same worktree -> reject/serialize
isolated worktrees -> allowed
```

---

# 103. EDIT TRANSACTIONS

Code edits should be transaction-like:

```text
prepare
 |
generate diff
 |
policy
 |
apply
 |
diagnostics
 |
test
 |
commit transaction
```

---

# 104. EXTERNAL CHANGE DETECTION

If an agent based its edit on hash A but the file is now hash B:

```text
detect divergence
 |
do not overwrite silently
 |
re-read
 |
rebase/merge/ask
```

---

# 105. LOCK MANAGER

Support scoped locks for:

```text
files
directories
worktrees
database
deployment targets
external resources
```

---

# 106. AGENT ORCHESTRATOR

The orchestrator manages:

```text
task graph
agent allocation
model selection
key pools
dependencies
parallel execution
artifact handoff
verification
recovery
```

---

# 107. TASK DAG

```text
Planner
 |
 +-- Research
 |
 +-- Architecture
 |
 +-- Implement
      |
      +-- Tests
      |
      +-- Review
             |
             +-- Verify
```

---

# 108. ORCHESTRATOR REQUIREMENTS

Must support:

- sequential;
- parallel;
- dependencies;
- conditional branches;
- retries;
- timeout;
- budgets;
- cancellation;
- artifacts;
- human approval.

---

# 109. CUSTOM WORKFLOW AS CODE

User-defined orchestration MUST be executable code.

Recommended TypeScript API:

```ts
export default defineWorkflow({
  name: "release-review",
  scope: "global",

  concurrency: {
    maxAgents: 4
  },

  tasks: [
    task("tests", {
      agent: "verifier"
    }),

    task("security", {
      agent: "security-reviewer",
      dependsOn: ["tests"]
    }),

    task("architecture", {
      agent: "architecture-reviewer",
      dependsOn: ["tests"]
    }),

    task("synthesis", {
      agent: "reviewer",
      dependsOn: [
        "security",
        "architecture"
      ]
    })
  ],

  verify: [
    "tests.pass"
  ]
});
```

---

# 110. WORKFLOW DSL

Minimum primitives:

```ts
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

---

# 111. WORKFLOW SCOPES

```text
built-in
global
profile
project
```

Precedence:

```text
project
>
profile
>
global
>
built-in
```

---

# 112. WORKFLOW VERSIONING

A workflow run must pin:

```text
workflow version
plugin versions
skill versions
agent versions
model profile
```

Changing workflow code must not silently mutate an active run.

---

# 113. WORKFLOW RESUME

```text
workflow
 |
task A complete
 |
task B running
 |
process crash
 |
restart
 |
resume workflow
 |
continue B
```

---

# 114. WORKFLOW DRY RUN

Command:

```text
/orchestrate preview <name>
```

Must show:

```text
task graph
agents
models
keys
tools
MCPs
permissions
estimated tokens
estimated cost
execution targets
concurrency
```

---

# 115. WORKFLOW SANDBOX

Workflow code MUST run within an explicit trust profile.

Restrictions may include:

```text
filesystem
network
child process
imports
credentials
```

The workflow cannot elevate global policy.

---

# 116. WORKFLOW DEADLOCK DETECTION

Before execution, detect cycles:

```text
A -> B
B -> C
C -> A
```

and reject the workflow with a clear diagnostic.

---

# 117. RESOURCE DEADLOCK

Detect tasks blocked indefinitely on:

```text
API keys
agents
workers
locks
executors
```

---

# 118. BUDGET ALLOCATION

Parent budget may be partitioned:

```text
Task budget = 100k tokens

Planner = 10k
Coder A = 30k
Coder B = 30k
Reviewer = 20k
Reserve = 10k
```

---

# 119. BUDGET REBALANCING

Unused allocation MAY be redistributed according to policy.

No task may exceed the global hard cap.

---

# 120. EXTERNAL CONNECTOR LAYER

Anantham needs an integration layer separate from raw model tools.

```ts
interface ExternalConnector {
  id: string;

  capabilities(): ConnectorCapabilities;

  authenticate(): Promise<void>;

  invoke(
    request: ConnectorRequest
  ): Promise<ConnectorResult>;
}
```

---

# 121. CONNECTOR CLASSES

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

---

# 122. EXTERNAL SERVICES

Architecture should support connectors for:

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

Connectors are optional; MCP can provide an alternative integration path.

---

# 123. WEBHOOK CONNECTOR

Support inbound triggers:

```text
POST /v1/webhooks/<provider>/<event>
```

Authentication:

```text
HMAC
signature
timestamp
nonce
IP allowlist
```

---

# 124. GITHUB INTEGRATION

Support:

```text
issues
pull requests
reviews
comments
branches
checks
actions
releases
```

---

# 125. PR WORKFLOW

Potential flow:

```text
issue
 |
planner
 |
implementation agents
 |
review
 |
tests
 |
PR artifact
 |
create PR
 |
CI
 |
repair
 |
approve
 |
merge
```

---

# 126. CI CONNECTORS

Future-compatible integrations:

```text
GitHub Actions
GitLab CI
Jenkins
CircleCI
Buildkite
custom CI
```

Operations:

```text
trigger
inspect
wait
logs
cancel
rerun
```

---

# 127. NOTIFICATION SYSTEM

Events can notify:

```text
terminal
desktop
webhook
Slack
Discord
email
```

Notify on:

- task completion;
- approval request;
- agent failure;
- provider outage;
- key cooldown;
- verification failure;
- background completion.

---

# 128. API/RPC

The runtime should expose:

```text
HTTP
WebSocket
SSE
JSON-RPC
```

for:

- tasks;
- agents;
- events;
- approvals;
- artifacts;
- sessions.

---

# 129. HEADLESS MODE

Example:

```bash
anantham run \
  --project ./repo \
  --workflow release-review \
  --headless \
  --json-events
```

Headless mode must never require an interactive TUI prompt.

---

# 130. MACHINE-READABLE OUTPUT

CLI supports:

```text
--json
--jsonl
--quiet
--no-color
```

---

# 131. SDK

TypeScript SDK:

```ts
const anantham = new AnanthamClient();

const task = await anantham.tasks.create({
  projectId,
  objective: "Fix OAuth callback"
});

await anantham.tasks.resume(task.id);
```

---

# 132. SDK EVENTS

SDK consumers can subscribe:

```ts
client.events.subscribe(
  taskId,
  event => {}
);
```

---

# 133. RPC AUTH

Local API should use:

- local socket where available;
- random session token;
- explicit remote auth.

Do not expose unrestricted local APIs over LAN by default.

---

# 134. AGENT TEAM API

External clients can:

```text
create team
create task
assign task
send message
pause team
resume team
inspect status
```

---

# 135. EXECUTION OBSERVABILITY

For each execution:

```text
request ID
task
agent
provider
key
tool
executor
duration
status
artifact
```

---

# 136. TOOL EXECUTION JOURNAL

Each tool execution must record:

```text
request
normalized arguments
policy result
approval
start time
end time
exit code
stdout artifact
stderr artifact
result summary
```

---

# 137. AGENT AUDIT

Each agent task records:

```text
role
model
provider
key pool
permissions
skills
tools
execution target
budget
outcome
```

---

# 138. MODEL ROUTING AUDIT

Every route decision should be explainable:

```text
selected:
OpenRouter / model-x

reason:
- tool calling required
- 128k context required
- project allows provider
- key capacity available
- cost profile = balanced
```

---

# 139. PERMISSION INTERACTION

Before an action:

```text
agent
 |
tool
 |
data sensitivity
 |
policy
 |
provider
 |
execution target
 |
decision
```

All Part 1 security rules remain authoritative.

---

# 140. DATA SENSITIVITY ROUTING

Example:

```text
SECRET
 -> local only

CONFIDENTIAL
 -> approved enterprise models

INTERNAL
 -> configured provider set

PUBLIC
 -> normal routing
```

---

# 141. BACKGROUND AGENT PRIVACY

Remote/background tasks must show:

```text
Execution target
Provider
Data leaving machine
Attachments
MCPs
Credential references
Retention policy
```

---

# 142. REMOTE ENVIRONMENT SNAPSHOT

A remote environment SHOULD support:

```text
image
dependencies
environment profile
repository commit
setup script
terminal definitions
```

This allows deterministic recreation.

---

# 143. ENVIRONMENT REPRODUCTION

Store:

```text
base image
runtime versions
install command
dev commands
dependencies lockfile
```

---

# 144. BACKGROUND PROCESS MANAGEMENT

Anantham should track:

```text
processId
taskId
agentId
cwd
startTime
status
ports
stdout artifact
stderr artifact
```

Commands:

```text
/shells
/shells start
/shells stop
/shells logs
/shells attach
/shells restart
```

---

# 145. DEVELOPMENT SERVER MANAGEMENT

Project environment may define:

```text
name
command
port
health URL
restart policy
```

Browser agents may use discovered dev servers.

---

# 146. BROWSER EXECUTION

Browser adapter supports:

- navigation;
- click;
- type;
- select;
- upload;
- download;
- screenshot;
- DOM snapshot;
- accessibility tree;
- console;
- network events;
- trace;
- video recording.

---

# 147. COMPUTER USE

Optional advanced capability:

```text
screen
mouse
keyboard
clipboard
window
```

It MUST have a high-risk permission profile.

---

# 148. BROWSER CREDENTIAL ISOLATION

Browser execution SHOULD use isolated profiles.

The user's personal browser cookies/session must never be inherited silently.

---

# 149. AGENT ARTIFACT HANDOFF

Agents SHOULD communicate durable results through artifacts.

Example:

```text
researcher
 -> research-report
 -> implementer

implementer
 -> changes.diff
 -> reviewer

reviewer
 -> findings.json
 -> repair-agent
```

---

# 150. TEAM ARTIFACT BUS

The artifact bus allows multiple agents to retrieve results without copying large transcripts.

---

# 151. AGENT CONTEXT ISOLATION

Each agent receives only:

```text
relevant project context
task context
required memory
required skills
required tools
```

not the entire team transcript.

---

# 152. PEER CONTEXT REQUEST

Agent A can request evidence from Agent B:

```text
"Provide the exact API contract artifact."
```

This becomes a structured message rather than full-context duplication.

---

# 153. AGENT CHALLENGE PROTOCOL

A reviewer may challenge:

```text
implementation decision
security assumption
test coverage
architecture choice
```

The integrator resolves via evidence.

---

# 154. HUMAN-IN-THE-LOOP

During a running task the user may:

```text
/steer
/pause
/resume
/cancel
/inject
```

---

# 155. STEER EVENT

A steering input becomes:

```text
task.steered
```

The current task history remains intact.

---

# 156. USER INTERVENTION PRIORITY

User intervention has higher priority than an agent-generated plan but remains below system/security invariants.

---

# 157. RESOURCE GOVERNOR

Resource governor controls:

```text
agents
requests
keys
tokens
cost
CPU
memory
disk
network
```

---

# 158. GLOBAL RESOURCE CAPS

No project/workflow can exceed global hard limits.

Project limits may be more restrictive.

---

# 159. PROJECT RESOURCE CAPS

Per project:

```text
max agents
max requests
max tokens/day
max cost/day
max background tasks
```

---

# 160. AGENT RESOURCE CAPS

Per agent:

```text
max iterations
max tokens
max tool calls
max cost
max duration
```

---

# 161. WORKFLOW RESOURCE CAPS

A workflow:

```text
max agents
max requests
max tokens
max cost
max duration
```

must be validated before start.

---

# 162. MODEL A/B TESTING

Optional evaluation workflow:

```text
same task
 |
model A
model B
 |
same verifier
 |
compare
```

Metrics:

```text
success
tokens
cost
latency
tool errors
verification
```

---

# 163. SHADOW MODEL

Optional:

```text
primary model
 |
execute
 |
shadow model reviews decision
```

Shadow model cannot mutate project unless explicitly promoted.

---

# 164. CROSS-PROVIDER REVIEW

A high-risk review can enforce:

```text
primary provider != review provider
```

where capacity allows.

---

# 165. CONSENSUS MODE

Optional advanced mode:

```text
Model A
Model B
Model C
 |
consensus
 |
continue
```

Use only when the user enables the additional cost.

---

# 166. DYNAMIC TEMPORARY TOOLS

The runtime MAY support task-scoped generated helper tools.

Requirements:

- sandbox;
- schema validation;
- task-scoped;
- explicit permissions;
- auto-cleanup;
- audit.

---

# 167. TOOL GENERATION SAFETY

Generated code cannot become a permanent plugin automatically.

Promotion requires explicit validation/publishing.

---

# 168. EXECUTION TARGET SELECTION

Agent/task can specify:

```text
local
docker
remote
cloud
```

Resolver considers:

```text
risk
availability
project
data policy
tool capability
cost
latency
```

---

# 169. PLUGIN EXECUTOR REQUIREMENTS

An executor plugin must report:

```text
network capability
filesystem capability
OS
CPU
memory
containerization
credential support
```

---

# 170. EXECUTOR FAILOVER

If a Docker executor is unavailable:

```text
policy:
  fallback = deny
```

or:

```text
policy:
  fallback = restricted-local
```

The fallback must be explicit.

---

# 171. TOOL/EXECUTOR SEPARATION

A tool specifies **what** should happen.

An executor specifies **where/how** it runs.

Example:

```text
shell.execute
      |
Executor = Docker
```

---

# 172. CONNECTOR/TOOL SEPARATION

Connector:

```text
how to communicate with service
```

Tool:

```text
what agent operation is exposed
```

This allows one connector to expose many tools.

---

# 173. API TOOL TRANSLATION

For custom REST APIs:

```text
OpenAPI
 |
connector
 |
tool generator
 |
validated tool definitions
```

Future versions may generate tools from OpenAPI schemas.

---

# 174. EXTERNAL API SCHEMA SUPPORT

Support:

- OpenAPI;
- JSON Schema;
- GraphQL schema;
- MCP schema.

All generated tool inputs must be runtime validated.

---

# 175. CONNECTOR CREDENTIALS

Connector credentials are references only:

```text
github/work
postgres/dev
slack/company
```

Raw secrets remain in secure storage.

---

# 176. API CONNECTOR OBSERVABILITY

Track:

```text
endpoint
operation
latency
status
retry
provider
credential profile
```

---

# 177. WEBHOOK TASK CREATION

External event:

```text
GitHub issue opened
 |
webhook
 |
Anantham task
 |
project resolution
 |
workflow
```

---

# 178. TASK AUTHENTICATION

External task requests MUST identify:

```text
source
project
workflow
request ID
authentication
```

---

# 179. WORKFLOW TRIGGER SECURITY

Only trusted webhook/config sources may trigger privileged workflows.

---

# 180. NOTIFICATION DE-DUPLICATION

Repeated failures should not spam.

Use:

```text
event fingerprint
cooldown
aggregation
```

---

# 181. AGENT EVENT STREAM

Users can subscribe to:

```text
agent
task
tool
model
MCP
workflow
```

with filters.

---

# 182. EVENT FILTERS

Example:

```text
events:
  task=123
  type in [tool.failed, verification.completed]
```

---

# 183. MODEL STREAMING

Model adapters SHOULD expose:

```text
text delta
tool call delta
usage
finish
error
```

without exposing provider-specific stream internals.

---

# 184. TOOL CALL STREAMING

For long tools:

```text
started
progress
stdout chunk
stderr chunk
completed
```

---

# 185. AGENT PROGRESS EVENTS

Agents should emit structured progress:

```json
{
  "phase": "testing",
  "message": "Running authentication integration tests",
  "percent": 72
}
```

Progress must not be confused with final verification.

---

# 186. HUMAN APPROVAL QUEUE

The approval system from Part 1 should integrate with agents and workflows.

Approval request contains:

```text
task
agent
tool
arguments
data sensitivity
risk
impact
```

---

# 187. BATCH APPROVAL

User may approve multiple safe homogeneous operations.

Example:

```text
approve all read-only filesystem requests for this task
```

---

# 188. APPROVAL EXPIRATION

Approvals can expire.

A stale approval must not authorize a new operation.

---

# 189. APPROVAL REPLAY PROTECTION

An approval is bound to:

```text
task
tool
normalized arguments
policy revision
timestamp
```

---

# 190. POLICY REVISION

Every task/tool approval references a policy version.

If policy changes:

```text
old approval
```

may become invalid.

---

# 191. POLICY EXPLANATION

Command:

```text
/policy explain <action>
```

returns:

```text
effective policy
source layers
risk classification
decision
reason
```

---

# 192. POLICY SIMULATION

Command:

```text
/policy simulate <tool> <args>
```

must not execute the action.

---

# 193. SAFE MODE

A restricted profile:

```text
readonly
```

must permit:

- read;
- search;
- analysis;
- retrieval.

It must not permit edits/deployment.

---

# 194. AUTO MODE

Auto mode removes routine interaction friction but must not weaken global security rules.

---

# 195. DANGEROUS MODE

Dangerous mode explicitly enables high-risk tool categories.

It must be visible in the TUI.

---

# 196. SKIP-PERMISSIONS MODE

Equivalent to a high-risk "yolo" profile.

Requirements:

- explicit opt-in;
- visible warning;
- audit event;
- no hidden automatic enabling;
- global security constraints may still remain mandatory.

---

# 197. AGENT MODEL PROFILE SWITCHING

An agent may switch models if:

```text
current model unavailable
or
task requires capability absent
```

The switch is logged.

---

# 198. MODEL SWITCH SAFETY

Before switching, rebuild:

```text
context budget
content representation compatibility
tool schema capability
output schema compatibility
```

---

# 199. PROVIDER FALLBACK POLICY

Configurable:

```text
fail
retry same
alternate key
alternate model
alternate provider
local fallback
ask user
```

---

# 200. PROVIDER QUOTA STOP

If provider quota is exhausted:

```text
WAITING_RESOURCE
```

not task failure.

---

# 201. RESOURCE WAIT RESUME

When user adds a new key:

```text
resource available
 |
resume eligible tasks
```

---

# 202. AGENT TEAM WORKFLOW EXAMPLE

```ts
export default defineWorkflow({
  name: "feature-development",

  tasks: [
    task("architecture", {
      agent: "architecture-reviewer"
    }),

    task("backend", {
      agent: "implementer",
      dependsOn: ["architecture"]
    }),

    task("frontend", {
      agent: "implementer",
      dependsOn: ["architecture"]
    }),

    task("tests", {
      agent: "test-engineer",
      dependsOn: ["backend", "frontend"]
    }),

    task("review", {
      agent: "reviewer",
      dependsOn: ["tests"]
    }),

    task("verify", {
      agent: "verifier",
      dependsOn: ["review"]
    })
  ]
});
```

---

# 203. CODE-DEFINED ORCHESTRATION REQUIREMENTS

Workflow files must be:

- syntax-valid;
- schema-valid;
- versioned;
- dependency-resolved;
- policy-checked;
- testable;
- resumable.

---

# 204. WORKFLOW TESTING

Use mocked:

```text
models
providers
tools
MCPs
executors
```

to test workflow logic without external costs.

---

# 205. WORKFLOW UNIT TEST EXAMPLE

```ts
describe("release-review", () => {
  it("blocks release when security review fails", async () => {
    const result = await runWorkflowTest({
      workflow: releaseReview,
      fixtures: {
        security: "failed"
      }
    });

    expect(result.status).toBe("failed");
  });
});
```

---

# 206. AGENT EVALUATION

Agent roles should be benchmarked independently.

Example:

```text
planner benchmark
coder benchmark
reviewer benchmark
debugger benchmark
```

---

# 207. TEAM EVALUATION

Team benchmarks measure:

```text
coordination overhead
duplicate work
task conflicts
message volume
artifact quality
completion
cost
```

---

# 208. PARALLELISM EFFICIENCY

Measure:

```text
serial duration
parallel duration
speedup
resource cost
conflict rate
```

A system is not successful merely because it can spawn many agents.

---

# 209. API KEY POOL EFFICIENCY

Measure:

```text
requests/key
429 rate
average wait
throughput
error rate
fairness
```

---

# 210. MODEL ROUTER EVALUATION

Compare routing strategies:

```text
static
cost-aware
latency-aware
capability-aware
adaptive
```

---

# 211. EXTENSION TEST MATRIX

Each plugin/MCP/skill must be tested against:

```text
install
enable
disable
reload
failure
uninstall
restart
```

---

# 212. MCP TEST MATRIX

Test:

```text
healthy server
slow server
crashed server
invalid schema
auth expiration
malicious output
large output
```

---

# 213. EXECUTOR TEST MATRIX

Test:

```text
local
Docker
remote mock
timeout
memory limit
network deny
filesystem deny
process kill
```

---

# 214. AGENT FAILURE TEST MATRIX

Test:

```text
model failure
tool failure
provider failure
key exhaustion
context exhaustion
policy denial
sandbox failure
agent crash
```

---

# 215. RECOVERY TEST MATRIX

Every recovery path must produce:

```text
original failure
recovery action
new state
verification
```

---

# 216. SOURCE COMPATIBILITY

Anantham should maintain compatibility adapters for common ecosystems, not copy their internals.

Potential profiles:

```text
claude
gemini
opencode
pi
codex
```

These profiles may map:

```text
commands
rules
skills
MCP config
agent definitions
```

where compatible.

---

# 217. CONFIG MIGRATION

Migration commands:

```text
/migrate claude
/migrate gemini
/migrate opencode
/migrate cursor
```

The migration process must show:

```text
imported
converted
unsupported
manual action required
```

---

# 218. CLAUDE/GEMINI/OPENCODE FILE DISCOVERY

Project bootstrap may inspect:

```text
CLAUDE.md
GEMINI.md
AGENTS.md
.cursor/rules/
```

These are interpreted as context/configuration, never global security authority.

---

# 219. COMMAND COMPATIBILITY

Common aliases:

```text
/continue -> /resume
/chat -> /resume
/sessions -> /resume
/summarize -> /compact
```

Compatibility aliases MUST resolve into canonical Anantham commands.

---

# 220. `/plan`

Plan mode uses read-only policies.

Planner may:

- inspect;
- retrieve;
- analyze;
- create plan artifacts.

It cannot edit project files.

---

# 221. `/analyze`

Analyze mode:

- repository map;
- dependencies;
- diagnostics;
- risk;
- architecture;
- technical debt.

No mutation by default.

---

# 222. `/review`

Review may be:

```text
single
parallel
cross-provider
artifact-backed
```

---

# 223. `/ultrareview`

UltraReview:

```text
multiple independent reviewers
+
structured findings
+
synthesis
+
objective verification
```

---

# 224. REVIEW MODEL SELECTION

User may configure:

```text
reviewer model
security model
architecture model
performance model
synthesizer model
```

---

# 225. REVIEW FINDING CONTRACT

```json
{
  "severity": "HIGH",
  "confidence": 0.92,
  "title": "Missing authorization check",
  "location": {
    "file": "src/api/users.ts",
    "line": 142
  },
  "evidence": [],
  "impact": "...",
  "recommendation": "..."
}
```

---

# 226. REVIEW-TO-REPAIR

A blocking finding automatically becomes:

```text
repair task
```

subject to policy.

---

# 227. REVIEW DISAGREEMENT

If reviewers disagree:

```text
finding cluster
 |
evidence
 |
adjudicator
 |
resolved/unresolved
```

Human review may be required for high-risk decisions.

---

# 228. ARTIFACT-BASED VERIFICATION

Every major workflow should create:

```text
plan artifact
change artifact
test artifact
review artifact
final verification artifact
```

---

# 229. NOTIFY ON ARTIFACT

Users can configure notifications for artifact creation.

---

# 230. AGENT TEAM SHARED MEMORY

Teams may share:

```text
team memory
```

but team memory is distinct from:

```text
project memory
agent memory
global memory
```

---

# 231. TEAM MEMORY POLICY

Team memory should expire or be promoted into project memory only through explicit rules.

---

# 232. AGENT CLAIMS

Agents may claim:

```text
task
artifact ownership
file ownership
```

Claims should be visible.

---

# 233. CLAIM EXPIRATION

Claims expire on:

```text
completion
cancel
timeout
heartbeat loss
```

---

# 234. TASK HANDOFF

Agent can transfer a task:

```text
current agent
 |
handoff artifact
 |
new owner
```

The task history remains continuous.

---

# 235. TEAM COORDINATION LIMITS

The system should detect:

```text
too many messages
duplicate tasks
agent loops
unproductive disagreement
```

and escalate to coordinator.

---

# 236. COORDINATOR AGENT

Coordinator may be:

- deterministic scheduler;
- model-assisted planner.

Final task state remains deterministic.

---

# 237. MODEL-ASSISTED ORCHESTRATION LIMIT

Models can propose DAG structure, but execution engine validates:

```text
dependencies
permissions
resource limits
capabilities
```

---

# 238. ORCHESTRATOR DETERMINISM

Given identical:

```text
workflow version
state
policies
resource conditions
```

the scheduling decisions should be reproducible as far as practical.

---

# 239. AGENT NONDETERMINISM

Model output is inherently non-deterministic.

Therefore benchmark harness must record:

```text
model config
temperature if applicable
seed if supported
provider
request
```

where available.

---

# 240. TOOL DETERMINISM

Tools should record enough information to distinguish:

```text
same input -> same environment
```

from:

```text
same tool call -> different external state
```

---

# 241. EXTERNAL SIDE EFFECT JOURNAL

For network/API actions, store:

```text
connector
operation
request hash
response status
side-effect classification
```

Do not store secrets.

---

# 242. SAFE RETRY MATRIX

| Action | Retry |
|---|---|
| Read file | Yes |
| Search | Yes |
| Model generation | Yes |
| GET API | Usually yes |
| POST without idempotency | No |
| Git commit | Context-dependent |
| Git push | No automatic duplicate |
| Deploy | No automatic retry without policy |
| Delete | No unless explicitly idempotent |

---

# 243. CONNECTOR RATE LIMITS

External connectors also use resource governance.

---

# 244. CONNECTOR FAILOVER

Where possible:

```text
primary endpoint
secondary endpoint
```

but side-effect semantics remain authoritative.

---

# 245. REMOTE SECRET INJECTION

Remote executor should receive credential references, not dump secrets into workflow files.

---

# 246. REMOTE AUDIT

Record:

```text
remote host
environment
image
credential references
network policy
```

---

# 247. REMOTE DATA RETURN

Large remote outputs become artifacts instead of giant inline responses.

---

# 248. FILE DOWNLOAD SAFETY

Remote/browser downloads are:

```text
attachment
content object
security scan
artifact
```

before entering context.

---

# 249. FILE UPLOAD SAFETY

Agent uploads require:

```text
source classification
destination policy
network policy
approval where necessary
```

---

# 250. TOOL NAME COLLISION

If two plugins provide the same tool name:

```text
namespace
priority
explicit conflict resolution
```

must prevent ambiguous execution.

---

# 251. TOOL NAMESPACING

Recommended:

```text
native.filesystem.read
mcp.playwright.browser_navigate
plugin.github.create_pr
```

User-facing aliases may be shorter.

---

# 252. SKILL NAME COLLISION

Skills also use namespaced IDs.

---

# 253. MODEL PROFILE COLLISION

Project-specific model profile overrides must be explicit.

---

# 254. PLUGIN DEPENDENCY GRAPH

Plugin resolver must detect:

```text
A -> B
B -> C
C -> A
```

and reject cycles.

---

# 255. SKILL DEPENDENCY CYCLE

Same rule applies to skills.

---

# 256. MCP DEPENDENCY

If a skill needs MCP X and X is disabled:

```text
skill unavailable
```

rather than partially executing.

---

# 257. CAPABILITY RESOLUTION

Before agent execution, calculate:

```text
required:
 tools
 skills
 MCP
 model capabilities
 executor
 permissions
```

Then resolve all dependencies.

---

# 258. CAPABILITY FAILURE

Return an actionable diagnostic:

```text
Agent "browser-reviewer" cannot start.

Missing:
  browser capability

Candidate:
  Playwright MCP disabled

Suggested:
  /mcps enable playwright
```

---

# 259. AGENT STARTUP CHECK

Agent starts only after:

```text
model resolved
tools resolved
skills resolved
MCP resolved
executor resolved
policy resolved
budget resolved
context plan available
```

---

# 260. AGENT STARTUP ARTIFACT

Create:

```text
agent-startup.json
```

recording resolved capabilities.

---

# 261. PROVIDER STARTUP

On runtime startup:

```text
load provider config
validate
discover models
health-check
build capability cache
```

Provider startup must not block all local functionality if remote providers are unavailable.

---

# 262. MODEL DISCOVERY

Provider adapters may discover models dynamically.

Models can also be statically configured.

---

# 263. MODEL CAPABILITY CACHE

Cache:

```text
provider
model
capabilities
context size
pricing metadata
last validated
```

---

# 264. MODEL CAPABILITY STALENESS

If provider capability data becomes stale:

```text
warn
refresh
```

before high-risk multimodal execution.

---

# 265. MODEL DEPRECATION

Provider may mark model:

```text
active
deprecated
retired
```

Router avoids retired models.

---

# 266. MODEL MIGRATION

User can define:

```text
/model migrate profile-name
```

to replace deprecated models.

---

# 267. KEY ROTATION

Support credential rotation without invalidating sessions.

---

# 268. API KEY EXPIRATION

Before expiry:

```text
warn
```

After expiry:

```text
disable
```

and route to a healthy key if available.

---

# 269. API KEY USAGE PRIVACY

`/api usage` shows masked key IDs only.

---

# 270. PROVIDER USAGE

Usage aggregation:

```text
provider
model
auth profile
key
project
session
task
agent
```

---

# 271. COST ESTIMATION

Where provider pricing is known:

```text
input tokens
output tokens
cached tokens
reasoning tokens if applicable
non-text units
```

produce estimated cost.

---

# 272. UNKNOWN COST

If pricing is unknown:

```text
cost = unavailable
```

Never invent pricing.

---

# 273. CONTEXT COST + MODEL COST

Router may optimize:

```text
context compression cost
+
model generation cost
```

rather than generation cost alone.

---

# 274. SPEED PROFILE

Built-in:

```text
fast
balanced
quality
maximum
cheap
safe
```

---

# 275. SAFE PROFILE

Safe profile may enforce:

```text
readonly analysis
approved providers
no external network
mandatory review
```

---

# 276. MAXIMUM PROFILE

Maximum may permit:

```text
more parallelism
stronger models
more reviews
larger budgets
```

but still respects security.

---

# 277. USER CUSTOM MODEL PROFILE

Profiles are code/config data, not hard-coded into the runtime.

---

# 278. USER CUSTOM AGENT

Users can define:

```yaml
name: database-specialist
modelProfile: reasoning
skills:
  - sql
  - migrations
tools:
  - filesystem.read
  - shell.execute
permissionProfile: developer
```

---

# 279. CUSTOM AGENT COMMANDS

```text
/agents create
/agents inspect
/agents enable
/agents disable
```

---

# 280. AGENT VERSIONING

Custom agent definitions are versioned.

---

# 281. AGENT MEMORY MIGRATION

When agent definition changes:

```text
memory namespace
```

may retain history but new capability profile is versioned.

---

# 282. SKILL + AGENT COMPATIBILITY

Agent may declare:

```text
required skill version >= 2.0
```

---

# 283. PLUGIN + AGENT CAPABILITY RESOLUTION

If a custom agent requires a tool from a plugin:

```text
plugin disabled
 ->
agent unavailable
```

with diagnostic.

---

# 284. AGENT TEMPLATE

Future feature:

```text
/agents template
```

allows reusable role templates.

---

# 285. WORKFLOW TEMPLATE

Future:

```text
/orchestrate template
```

for common DAGs:

```text
bugfix
feature
refactor
release
security-audit
research
```

---

# 286. REMOTE WORKFLOW EXECUTION

Workflow can specify:

```ts
executor("docker")
```

or remote profiles.

---

# 287. REMOTE WORKFLOW POLICY

Data-sensitive project workflows may restrict remote execution.

---

# 288. TASK MIGRATION BETWEEN EXECUTORS

A paused task may switch:

```text
local -> Docker
Docker -> remote
```

if state/artifacts/environment requirements allow.

---

# 289. TASK MIGRATION LOG

Record:

```text
from executor
to executor
reason
timestamp
checkpoint
```

---

# 290. AGENT MIGRATION

Same principle for agent/model/provider changes.

---

# 291. MCP MIGRATION

MCP configuration may change while a task is paused.

A resumed task revalidates capability compatibility.

---

# 292. PLUGIN HOT RELOAD

Hot reload only if:

```text
plugin declares reloadSafe
no active incompatible operation
state migration supported
```

---

# 293. PLUGIN CRASH ISOLATION

Plugin failure should not crash the entire runtime where isolation permits.

---

# 294. HOOK CRASH ISOLATION

Non-critical hook failure should produce a visible warning rather than silently breaking execution.

Security-critical hook may fail closed.

---

# 295. AGENT CRASH ISOLATION

An agent process failure should become:

```text
agent.failed
```

and parent recovery policy decides:

```text
retry
resume
reassign
stop
```

---

# 296. TEAM CRASH

Coordinator failure must be recoverable from task board state.

---

# 297. WORKER POOL

Parallel workers use:

```text
bounded concurrency
priority queue
lease
heartbeat
recovery
```

---

# 298. WORKER QUEUE DURABILITY

Queued tasks must be durable across restart.

---

# 299. FAIR SCHEDULING BETWEEN PROJECTS

Optional global scheduler should prevent one project from consuming all worker capacity.

---

# 300. PROJECT QUOTA

Projects may define:

```text
max background agents
max concurrent tool calls
max daily spend
```

---

# 301. USER QUOTA

Future multi-user architecture can add account-level quotas without changing task model.

---

# 302. TASK TIMEOUT

Each task has an absolute deadline.

---

# 303. AGENT TIMEOUT

Each agent has its own deadline within parent budget.

---

# 304. TOOL TIMEOUT

Every tool call has timeout unless explicitly disabled for streaming.

---

# 305. PROCESS TIMEOUT

Long-running shells require heartbeat/termination policy.

---

# 306. BROWSER TIMEOUT

Browser actions require:

```text
navigation timeout
action timeout
overall session timeout
```

---

# 307. MCP TIMEOUT

MCP call timeout must be distinct from server health timeout.

---

# 308. CONNECTOR TIMEOUT

External API calls have:

```text
connect timeout
read timeout
overall timeout
```

---

# 309. RETRY BUDGET

Each layer must avoid retry multiplication.

Example:

```text
workflow retry x3
agent retry x3
provider retry x3
tool retry x3
```

could create 81 executions.

Anantham MUST enforce a global retry budget.

---

# 310. RETRY TREE

A task stores aggregate retry count across all layers.

---

# 311. RECOVERY STRATEGY ORDER

Default:

```text
retry
alternate key
alternate model
alternate tool
new agent
new executor
ask user
stop
```

This is policy-configurable.

---

# 312. ARTIFACT PRESERVATION ON FAILURE

Failure does not delete generated artifacts.

Artifacts are essential for debugging/recovery.

---

# 313. FAILED WORKTREE PRESERVATION

A failed coding task's worktree should remain available for inspection until cleanup policy runs.

---

# 314. CLEANUP POLICY

Temporary worktrees and containers may be cleaned only after:

```text
task completed/abandoned
artifacts preserved
user retention policy satisfied
```

---

# 315. CLEANUP DRY RUN

Provide:

```text
/cleanup preview
```

showing what would be removed.

---

# 316. BACKGROUND TASK RETENTION

Completed tasks can be retained according to project policy.

---

# 317. REMOTE ENVIRONMENT CLEANUP

Remote environments are eligible for cleanup after:

```text
artifact sync
checkpoint
task terminal state
```

---

# 318. REMOTE ARTIFACT SYNC

Before environment destruction:

```text
upload/sync artifacts
verify hashes
commit metadata
destroy environment
```

---

# 319. WORKFLOW ARTIFACT CONTRACT

Workflow task outputs should declare:

```ts
artifact("name", "type")
```

and downstream tasks receive references.

---

# 320. CONDITIONAL ARTIFACT BRANCHING

Example:

```ts
condition(ctx => ctx.artifact("tests").status === "failed")
```

must execute under workflow sandbox.

---

# 321. USER APPROVAL IN WORKFLOW

Workflow can require:

```ts
approve("deploy-production")
```

which becomes a durable approval task.

---

# 322. WORKFLOW PAUSE

When waiting approval/resource:

```text
workflow status = waiting
```

No busy looping.

---

# 323. WORKFLOW RESUME

On approval/resource arrival:

```text
resume from last durable checkpoint
```

---

# 324. WORKFLOW CANCELLATION

Cancel:

```text
queued children
running child tasks
background processes
```

according to propagation policy.

---

# 325. TASK CANCELLATION PROPAGATION

Parent task may specify:

```text
propagateCancel = true|false
```

---

# 326. TEAM STOP POLICY

Stopping a team may:

```text
cancel all
pause all
detach children
```

user selects policy.

---

# 327. AGENT DETACH

A background agent can continue while the user leaves its session.

---

# 328. AGENT REATTACH

User can reopen its task panel later.

---

# 329. PROJECT AGENT DASHBOARD

Show:

```text
project
active agents
queued tasks
blocked
cost
tokens
tool calls
```

---

# 330. PROVIDER DASHBOARD

Show:

```text
provider
models
health
latency
rate limits
key pool
requests
cost
```

---

# 331. MCP DASHBOARD

Show:

```text
server
status
transport
tools
resources
prompts
latency
errors
permissions
```

---

# 332. PLUGIN DASHBOARD

Show:

```text
plugin
version
source
trust
permissions
provides
health
```

---

# 333. SKILL DASHBOARD

Show:

```text
skill
version
source
tools
dependencies
usage
last tested
```

---

# 334. EXECUTOR DASHBOARD

Show:

```text
executor
status
capacity
active tasks
network mode
sandbox mode
```

---

# 335. AGENT TEAM DASHBOARD

Show:

```text
team
agents
tasks
messages
blocked tasks
artifacts
cost
```

---

# 336. TUI CONTEXT

Part 3 will define detailed TUI layout, but Part 2 requires machine-readable activity models so the UI can render:

```text
agents
tasks
providers
keys
MCP
plugins
skills
executors
```

---

# 337. DEFAULT AGENT PROFILES

Recommended profiles:

```text
planner
coder
reviewer
researcher
debugger
security
browser
data
release
```

---

# 338. DEFAULT WORKFLOWS

Recommended built-ins:

```text
feature-development
bug-fix
deep-review
security-audit
refactor
research
release-review
dependency-update
```

---

# 339. WORKFLOW COMPOSITION

A workflow may call another workflow if:

```text
dependency graph remains acyclic
permissions allow
budget remains valid
```

---

# 340. WORKFLOW RECURSION LIMIT

No unlimited nested workflow calls.

---

# 341. AGENT RECURSION LIMIT

Default:

```text
delegation depth = 3
```

Configurable but globally capped.

---

# 342. TASK TREE DEPTH

Task tree depth is persisted and enforced.

---

# 343. AGENT MESSAGE LIMIT

Team communication must have a configurable message budget.

---

# 344. ARTIFACT MESSAGE PREFERENCE

Large data should be sent by artifact reference instead of message body.

---

# 345. AGENT CONTEXT PACKAGE

Each child agent should receive:

```text
objective
constraints
relevant files
relevant symbols
relevant memory
required artifacts
allowed tools
role instructions
```

---

# 346. AGENT RESULT VALIDATION

Child outputs must validate against the handoff schema.

Invalid output triggers:

```text
repair
retry
or failure
```

---

# 347. MODEL STRUCTURED OUTPUT FAILURE

If schema-invalid:

```text
retry with corrective constraint
```

subject to model budget.

---

# 348. MODEL TOOL-CALL FAILURE

If tool arguments invalid:

```text
schema error
 |
model corrective turn
```

not arbitrary string parsing.

---

# 349. TOOL AUTH FAILURE

Tool auth failures become structured errors.

---

# 350. MCP AUTH EXPIRY

When possible:

```text
reauth
```

otherwise task enters waiting state.

---

# 351. PROVIDER AUTH EXPIRY

Route to another credential or request user action.

---

# 352. API KEY ADD DURING ACTIVE TASK

New key becomes eligible for scheduler after validation.

---

# 353. PROVIDER ADD DURING ACTIVE TASK

New provider becomes eligible after:

```text
configuration validation
model discovery
capability validation
```

---

# 354. MODEL PROFILE EDIT DURING ACTIVE TASK

Existing tasks keep their pinned profile unless explicitly migrated.

---

# 355. SKILL EDIT DURING ACTIVE TASK

Existing workflow run retains pinned skill version.

---

# 356. PLUGIN EDIT DURING ACTIVE TASK

Use version-pinned plugin runtime to avoid semantic drift.

---

# 357. HOT CONFIGURATION

Changes to future tasks may be hot-reloaded.

Active tasks keep their resolved execution configuration unless explicitly migrated.

---

# 358. EXECUTION MANIFEST

At task start create:

```text
execution-manifest.json
```

containing:

```text
project
session
task
agent
model
provider
auth profile
key pool
skills
tools
MCPs
permissions
executor
workflow version
context revision
```

---

# 359. EXECUTION MANIFEST PURPOSE

Allows:

- resume;
- replay;
- debugging;
- audit;
- comparison.

---

# 360. VERSION COMPATIBILITY

Resume must verify:

```text
runtime
workflow
skills
plugins
tool schemas
model capability
```

If incompatible:

```text
migrate
or
fallback
or
ask
```

---

# 361. STATE MIGRATION

Persistent task/session state must have schema version.

---

# 362. MIGRATION SAFETY

Before migration:

```text
backup
```

where practical.

---

# 363. PLUGIN STATE MIGRATION

Plugin authors must declare:

```text
stateVersion
migration
```

if persistent state exists.

---

# 364. TOOL SCHEMA EVOLUTION

A historical tool call remains associated with its schema version.

---

# 365. MCP SCHEMA CHANGE

If an MCP tool changes schema between runs:

```text
new schema
 |
compatibility check
 |
rebuild call
```

Do not silently replay old arguments.

---

# 366. PROVIDER API VERSION

Provider adapters record API version where available.

---

# 367. MODEL PARAMETER VERSION

Execution manifest records model request configuration.

---

# 368. PARALLEL REQUEST ACCOUNTING

Each request gets:

```text
global request ID
agent ID
key ID
```

This prevents accounting ambiguity.

---

# 369. GLOBAL REQUEST GOVERNOR

A central request governor ensures:

```text
max requests
max tokens
max concurrent calls
```

regardless of how many agents are running.

---

# 370. TOKEN BUDGET GOVERNOR

Token accounting must aggregate:

```text
model
agent
task
workflow
project
global
```

---

# 371. COST GOVERNOR

Same aggregation hierarchy for cost.

---

# 372. BUDGET EXHAUSTION STATES

```text
warning
restricted
waiting_resource
failed
```

depending on configured policy.

---

# 373. WARNING THRESHOLDS

Example:

```text
70% warn
85% restrict
100% hard stop
```

Configurable.

---

# 374. AGENT SPEED METRICS

Track:

```text
turns/min
tools/min
tokens/min
tasks/hour
```

---

# 375. ORCHESTRATION PERFORMANCE

Track:

```text
queue wait
agent startup
execution
integration
verification
```

---

# 376. REMOTE LATENCY

Track:

```text
environment provisioning
network
tool
artifact sync
```

---

# 377. API KEY LATENCY

Track per key.

---

# 378. MODEL LATENCY

Track:

```text
TTFT where available
total generation time
```

---

# 379. PROVIDER ERROR CLASSIFICATION

Normalize:

```text
auth
rate-limit
quota
network
invalid-request
unsupported-capability
server
unknown
```

---

# 380. CONNECTOR ERROR CLASSIFICATION

Same normalized taxonomy.

---

# 381. EXECUTOR ERROR CLASSIFICATION

```text
sandbox
permission
timeout
resource
process
environment
network
unknown
```

---

# 382. TOOL ERROR CONTRACT

All tools must normalize errors into:

```ts
interface ToolError {
  code: string;
  category: string;
  message: string;
  retryable: boolean;
  evidenceArtifactId?: string;
}
```

---

# 383. AGENT FAILURE CONTRACT

Agent failures include:

```text
model failure
tool failure
policy failure
budget failure
environment failure
internal runtime failure
```

---

# 384. WORKFLOW FAILURE CONTRACT

Workflow failure must identify:

```text
failed task
dependency chain
last checkpoint
recoverability
```

---

# 385. RECOVERABILITY CLASS

Every failed object should expose:

```text
recoverable
partially_recoverable
non_recoverable
```

---

# 386. SAFE RESUME REQUIREMENT

A task with `recoverable` status can be resumed without manual state reconstruction.

---

# 387. AGENT PROCESS REPLACEMENT

If an agent process dies, a replacement agent may resume from durable task state.

---

# 388. MODEL SWITCH DURING AGENT REPLACEMENT

Allowed if capability requirements remain satisfied.

---

# 389. WORKTREE HANDOFF

Replacement agent uses same worktree only after exclusive lease is acquired.

---

# 390. TOOL LEASE

Long-running tool/process may expose a lease.

---

# 391. TOOL PROCESS RESUME

A shell process may be resumable if external OS state survives.

Otherwise task receives a process-loss event and recovery policy decides.

---

# 392. BACKGROUND AGENT FOLLOW-UP DATA

Follow-up message becomes part of event log and is included in next context plan.

---

# 393. AGENT STATUS API

```text
GET /v1/agents
GET /v1/agents/:id
POST /v1/agents/:id/pause
POST /v1/agents/:id/resume
POST /v1/agents/:id/cancel
POST /v1/agents/:id/steer
```

---

# 394. TEAM STATUS API

```text
GET /v1/teams
GET /v1/teams/:id
POST /v1/teams/:id/message
POST /v1/teams/:id/pause
POST /v1/teams/:id/resume
POST /v1/teams/:id/stop
```

---

# 395. WORKFLOW API

```text
GET  /v1/workflows
POST /v1/workflows/validate
POST /v1/workflows/run
GET  /v1/workflows/runs/:id
POST /v1/workflows/runs/:id/pause
POST /v1/workflows/runs/:id/resume
POST /v1/workflows/runs/:id/cancel
```

---

# 396. PROVIDER API

```text
GET  /v1/providers
POST /v1/providers
DELETE /v1/providers/:id
GET  /v1/providers/:id/models
POST /v1/providers/:id/test
```

---

# 397. KEY API

```text
GET  /v1/keys
POST /v1/keys
DELETE /v1/keys/:id
POST /v1/keys/:id/enable
POST /v1/keys/:id/disable
```

---

# 398. MCP API

```text
GET  /v1/mcps
POST /v1/mcps
DELETE /v1/mcps/:id
POST /v1/mcps/:id/enable
POST /v1/mcps/:id/disable
POST /v1/mcps/:id/restart
```

---

# 399. PLUGIN API

```text
GET  /v1/plugins
POST /v1/plugins/install
DELETE /v1/plugins/:id
POST /v1/plugins/:id/enable
POST /v1/plugins/:id/disable
```

---

# 400. SKILL API

```text
GET  /v1/skills
POST /v1/skills/install
DELETE /v1/skills/:id
POST /v1/skills/:id/test
```

---

# 401. PART 2 ACCEPTANCE CRITERIA

## Models

- [ ] Provider-neutral ModelAdapter works.
- [ ] OpenRouter adapter works.
- [ ] At least two direct providers work.
- [ ] Custom provider profile validates.
- [ ] Capability negotiation rejects unsupported input.
- [ ] Provider health is tracked.
- [ ] Model routing is configurable.
- [ ] Model switching is durable.

## API keys

- [ ] Multiple keys can be added.
- [ ] Keys are securely stored/referenced.
- [ ] User controls concurrency.
- [ ] 429 causes cooldown.
- [ ] Failed keys are quarantined.
- [ ] Safe failover works.
- [ ] Usage is measured.

## Agents

- [ ] Role registry works.
- [ ] Agent budgets work.
- [ ] Child task delegation works.
- [ ] Heartbeats work.
- [ ] Task claiming works.
- [ ] Agent pause/resume works.
- [ ] Agent recovery works.

## Teams

- [ ] Team creation works.
- [ ] Shared task board works.
- [ ] Peer messages work.
- [ ] Claims expire.
- [ ] Team cancellation works.
- [ ] Team state survives restart.

## Tools

- [ ] Tool schema validation works.
- [ ] Tool gateway enforces policy.
- [ ] Deferred schema loading works.
- [ ] Tool result pruning works.
- [ ] Tool journal works.

## MCP

- [ ] MCP server registry works.
- [ ] Tool discovery works.
- [ ] Resource discovery works.
- [ ] Prompt discovery works.
- [ ] Auth lifecycle works.
- [ ] Circuit breaker works.
- [ ] Playwright-style server connects.
- [ ] Puppeteer-style server connects.
- [ ] Neo4j-style server connects.
- [ ] Chrome DevTools-style server connects.

## Plugins

- [ ] Plugin install.
- [ ] Plugin validation.
- [ ] Plugin permissions.
- [ ] Plugin enable/disable.
- [ ] Plugin unload.
- [ ] Plugin version pinning.

## Skills

- [ ] SKILL.md loads.
- [ ] Progressive disclosure works.
- [ ] Dependency resolution works.
- [ ] Skill version is pinned.
- [ ] Skill tests work.

## Hooks

- [ ] Before/after lifecycle events.
- [ ] Policy-aware blocking.
- [ ] Hook failure semantics.
- [ ] Audit logging.

## Execution

- [ ] Local executor.
- [ ] Docker executor.
- [ ] Environment profile.
- [ ] Process manager.
- [ ] Background agent.
- [ ] Remote executor interface.

## Orchestration

- [ ] DAG execution.
- [ ] Parallel execution.
- [ ] Conditions.
- [ ] Budgets.
- [ ] Workflow versioning.
- [ ] Workflow checkpoint.
- [ ] Workflow resume.
- [ ] Dry run.
- [ ] Deadlock detection.
- [ ] Workflow sandbox.

## Integrations

- [ ] Generic connector interface.
- [ ] REST support.
- [ ] Webhook security.
- [ ] GitHub connector architecture.
- [ ] CI connector architecture.
- [ ] Notifications.
- [ ] SDK.
- [ ] Headless mode.

---

# 402. REQUIRED PART 2 ADRs

```text
ADR-020 model adapter architecture
ADR-021 provider capability negotiation
ADR-022 API-key pool scheduler
ADR-023 rate-limit governor
ADR-024 provider failover
ADR-025 agent role model
ADR-026 task claim/lease system
ADR-027 agent team architecture
ADR-028 tool gateway
ADR-029 deferred tool schemas
ADR-030 MCP gateway
ADR-031 plugin runtime
ADR-032 skill registry
ADR-033 lifecycle hooks
ADR-034 executor abstraction
ADR-035 Docker sandbox
ADR-036 remote executor
ADR-037 Git worktree isolation
ADR-038 workflow DSL
ADR-039 workflow sandbox
ADR-040 connector abstraction
ADR-041 background agent lifecycle
ADR-042 model/key execution manifest
ADR-043 global resource governor
ADR-044 safe retry/idempotency
```

---

# 403. IMPLEMENTATION ORDER — PART 2

## Phase 2A — Model foundation

Implement:

```text
ModelAdapter
ProviderAdapter
ModelRouter
capability registry
```

## Phase 2B — Credentials/providers

Implement:

```text
credential manager
auth profiles
OpenRouter
direct providers
key pools
rate limits
```

## Phase 2C — Agent runtime interface

Implement:

```text
agent roles
budgets
leases
heartbeats
task claiming
```

## Phase 2D — Tool plane

Implement:

```text
ToolDefinition
ToolGateway
schemas
result pruning
native tools
```

## Phase 2E — MCP/plugins/skills/hooks

Implement:

```text
MCP registry
Plugin registry
Skill registry
Hook registry
```

## Phase 2F — Execution

Implement:

```text
local
Docker
worktrees
process manager
```

## Phase 2G — Teams

Implement:

```text
task board
peer messaging
agent teams
parallel execution
```

## Phase 2H — Orchestration

Implement:

```text
workflow DSL
workflow sandbox
global/project workflows
resume
dry run
```

## Phase 2I — Remote/integrations

Implement interfaces first, then concrete remote providers/connectors.

---

# 404. PART 2 NON-NEGOTIABLE INVARIANTS

1. No model provider is hard-coded into the runtime.
2. No raw API key enters ordinary model context.
3. Key pools cannot bypass global rate/cost limits.
4. Retrying side-effecting tools requires idempotency policy.
5. MCP tools pass through the Tool Gateway.
6. Plugins cannot bypass the PolicyEngine.
7. Skills cannot bypass the PolicyEngine.
8. Workflow code cannot elevate permissions.
9. Parallel code agents must use conflict-safe isolation.
10. Child agents use durable task leases.
11. Dead agents cannot retain infinite task ownership.
12. Background execution is budgeted.
13. Provider/model changes are recorded.
14. Plugin/skill versions are pinned for reproducible runs.
15. Workflow versions are pinned for active runs.
16. Large tool results are artifacts, not uncontrolled context.
17. Remote outputs are durable before environment destruction.
18. Agent/team state is recoverable after coordinator failure.
19. Capability requirements are resolved before agent execution.
20. Every major execution is represented in the event/artifact model from Part 1.

---

# 405. END OF PART 2

Part 3 will define:

- complete command language;
- CLI compatibility;
- TUI;
- theme;
- project/session/agent screens;
- multimodal interaction UX;
- `/attach`;
- `/context`;
- `/compact`;
- `/resume`;
- `/stats`;
- `/audit`;
- `/doctor`;
- `/evals`;
- `/replay`;
- security UX;
- credential UX;
- privacy;
- zero-loss operations;
- backup/restore;
- testing;
- benchmarks;
- SLO/SLI targets;
- performance;
- release engineering;
- migration;
- installation;
- packaging;
- documentation;
- final Definition of Done;
- production launch gates.
