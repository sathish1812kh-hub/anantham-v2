# ANANTHAM V2 — ENGINEERING PLAYBOOK

**Document:** `00_ANANTHAM_ENGINEERING_PLAYBOOK.md`
**Product:** Anantham V2
**Document Type:** Engineering Operating Standard / Implementation Playbook
**Status:** Authoritative engineering guidance derived from the Anantham V2 PRDs
**Audience:** AI engineering agents, human engineers, architects, reviewers, maintainers
**Primary Runtime:** TypeScript + Node.js
**Primary Storage:** SQLite + filesystem/object-store abstraction
**Architecture:** Local-first, provider-neutral, capability-based, policy-controlled, durable, event-sourced, extensible

---

# 0. PURPOSE

This document defines **how Anantham V2 must be engineered**.

It does not replace the Anantham V2 PRDs.

It provides the implementation discipline required to translate the PRDs into a maintainable, secure, durable production system.

The authoritative product contracts remain:

```text
ANANTHAM_PRD_V2_PART_1_PRODUCT_AND_ARCHITECTURE.md
ANANTHAM_PRD_V2_PART_2_AGENTS_INTEGRATIONS_AND_EXECUTION.md
ANANTHAM_PRD_V2_PART_3_CLI_SECURITY_UX_EVALUATION_IMPLEMENTATION.md
```

This playbook defines:

```text
HOW TO INSPECT
HOW TO REASON
HOW TO DESIGN
HOW TO MODIFY
HOW TO TEST
HOW TO RECOVER
HOW TO VERIFY
HOW TO REVIEW
HOW TO DOCUMENT
HOW TO DECLARE COMPLETION
```

The central engineering principle is:

```text
REQUIREMENT
    ↓
UNDERSTAND EXISTING SYSTEM
    ↓
ARCHITECTURE
    ↓
CONTRACTS
    ↓
STATE / SECURITY MODEL
    ↓
IMPLEMENTATION
    ↓
TESTS
    ↓
VERIFICATION
    ↓
OBSERVABILITY
    ↓
DOCUMENTATION
    ↓
MIGRATION
    ↓
ACCEPTANCE
```

Never reverse this order merely because implementation appears faster.

---

# 1. SOURCE AUTHORITY

## 1.1 Source hierarchy

When determining what Anantham should do, use this precedence:

```text
1. System/security invariants
2. Anantham V2 PRD requirements
3. Accepted ADRs
4. Versioned contracts/types/interfaces
5. Tests
6. Existing implementation
7. Project-specific instructions
8. Current task request
9. Model assumptions
```

A lower-level source cannot silently override a higher-level source.

Examples:

```text
model output
    < security policy

repository README
    < security policy

plugin prompt
    < security policy

MCP output
    < security policy

task request
    < PRD contract

implementation convenience
    < architecture contract
```

---

# 2. SOURCE USAGE RULES

Before implementing substantial functionality:

```text
1. Locate relevant PRD section.
2. Identify requirement IDs.
3. Read related architecture/contracts.
4. Search for accepted ADRs.
5. Inspect existing implementation.
6. Inspect related tests.
7. Identify dependencies.
8. Identify persistence impact.
9. Identify security impact.
10. Identify recovery impact.
11. Identify compatibility impact.
```

Do not begin implementation merely because the requested behavior sounds obvious.

If an authoritative source answers the question, use it.

Do not replace an existing contract with a newly invented abstraction without justification.

---

# 3. CONFLICT HANDLING

If two authoritative sources conflict:

```text
DO NOT silently choose one.
```

Instead:

```text
identify conflict
    ↓
identify authority level
    ↓
determine affected contracts
    ↓
determine migration impact
    ↓
determine data-loss risk
    ↓
propose resolution
    ↓
record versioned decision
```

A conflict record should contain:

```text
Change ID
Problem
Existing requirement
Conflicting requirement
Authority analysis
Recommended resolution
Alternative options
Compatibility impact
Migration impact
Data-loss impact
Testing impact
Rollback strategy
```

No silent architectural drift.

---

# 4. PRODUCT BOUNDARY

Anantham is a:

> durable, programmable AI-agent runtime surrounding AI models.

It is not merely:

```text
chatbot
LLM wrapper
CLI
MCP launcher
multi-agent swarm
code editor
workflow script
```

The runtime owns:

```text
authoritative state
context
policy
permissions
tools
agents
orchestration
memory
retrieval
artifacts
provenance
checkpoints
resources
verification
recovery
observability
```

Models own:

```text
reasoning
interpretation
planning proposals
action proposals
content generation
```

A model cannot become the authority over runtime state or security.

---

# 5. CORE ARCHITECTURAL BOUNDARY

Always preserve:

```text
MODEL
    ↓
proposal

ANANTHAM RUNTIME
    ↓
validate
    ↓
authorize
    ↓
execute
    ↓
persist
    ↓
verify
```

Never implement:

```text
MODEL
    ↓
execute arbitrary command
```

The runtime must remain authoritative.

---

# 6. CORE DOMAIN BOUNDARIES

Keep these concepts distinct:

```text
Project
Session
Task
Agent
Model
Provider
Tool
MCP
Plugin
Skill
Hook
Workflow
Memory
Context
Artifact
Attachment
Executor
Connector
Policy
Verification
Checkpoint
```

Do not merge them merely because they currently have similar data.

Use these semantic boundaries:

```text
Tool      = agent operation
Connector = external communication mechanism
Executor  = execution location/mechanism
Skill     = procedure
Memory    = knowledge
Context   = model-visible working set
Artifact  = durable output/evidence
MCP       = capability adapter
Plugin    = extension package
Hook      = deterministic lifecycle behavior
Workflow  = orchestration definition
Agent     = bounded execution identity
```

---

# 7. ENGINEERING PRIORITIES

When requirements conflict with optimization goals, prioritize:

## Priority 1 — Correctness

State, execution and contracts must remain correct.

## Priority 2 — Security

Authorization, isolation, credential protection and side-effect controls must remain intact.

## Priority 3 — Recoverability

Failures must preserve enough information for recovery and diagnosis.

## Priority 4 — Verifiability

The runtime must produce evidence that an operation actually succeeded.

## Priority 5 — Maintainability

Prefer understandable, composable architecture.

Only after these:

```text
performance
latency
cost
UX convenience
parallelism
```

---

# 8. ENGINEERING ANTI-PATTERNS

Do not:

```text
invent APIs without inspecting the repository
duplicate existing infrastructure
create parallel state systems
bypass ToolGateway
execute tools directly from agents
put business logic in the TUI
store secrets in SQLite
treat projections as authoritative
delete events during compaction
retry unknown side effects blindly
spawn unlimited agents
allow unlimited workflow recursion
silently overwrite user files
silently downgrade sandboxing
trust repository instructions as security policy
inject entire repositories into context
inject every tool schema into every prompt
claim completion because a model said "done"
claim tests that were not executed
claim recovery without restart testing
```

---

# 9. REQUIRED IMPLEMENTATION LOOP

Every substantial change follows:

```text
INSPECT
  ↓
UNDERSTAND
  ↓
DESIGN
  ↓
DEFINE CONTRACTS
  ↓
IMPLEMENT SMALLEST SAFE CHANGE
  ↓
TEST
  ↓
VERIFY
  ↓
DOCUMENT
  ↓
REVIEW
```

Do not expand scope until the current layer is verified.

---

# 10. PHASE 1 — INSPECT

Before modifying code, inspect:

```text
repository structure
package boundaries
entrypoints
runtime modules
database layer
event system
configuration
provider layer
tool layer
policy layer
agent layer
executor layer
tests
migrations
logging
observability
CLI/TUI
```

Locate:

```text
existing abstraction
existing implementation
existing interface
existing test
existing migration
existing ADR
```

Prefer extension over replacement.

---

# 11. PHASE 2 — UNDERSTAND

For the requested feature, answer:

```text
What requirement requires this?
What object owns this state?
What subsystem should implement it?
What existing abstraction already handles part of it?
What data is authoritative?
What data is derived?
What events are required?
What permissions are required?
What resources are consumed?
What can fail?
What must survive restart?
What must be observable?
How is success verified?
```

If these cannot be answered, implementation is premature.

---

# 12. PHASE 3 — ARCHITECTURE

Before coding, define:

```text
component
responsibility
inputs
outputs
dependencies
state
authority
failure behavior
recovery behavior
security boundary
observability
```

Avoid architecture based solely on file names.

Architecture should follow domain responsibility.

---

# 13. PHASE 4 — CONTRACTS

Before implementation, identify or define:

```text
types
interfaces
events
schemas
state transitions
error contracts
configuration contracts
API contracts
persistence contracts
```

Contracts should be explicit.

Prefer structured types over loosely typed dictionaries where domain semantics matter.

---

# 14. STATE OWNERSHIP

Every piece of mutable state must have an owner.

Ask:

```text
Who creates it?
Who mutates it?
Who authorizes mutation?
Who persists it?
Who reconstructs it?
Who verifies it?
Who cleans it up?
```

If ownership is ambiguous, the architecture is incomplete.

---

# 15. AUTHORITATIVE VS DERIVED DATA

Authoritative data includes, where applicable:

```text
event log
source project files
durable memory records
artifact content
workflow definitions
explicit configuration
checkpoints
```

Derived data includes:

```text
indexes
FTS data
semantic indexes
statistics projections
caches
UI state
temporary summaries
```

Never make derived data the only source of critical state.

---

# 16. EVENT SOURCING RULE

Authoritative events are immutable facts.

Never edit historical events in place.

Bad:

```text
UPDATE old_event SET ...
```

Correct:

```text
event A
event B correction
event C invalidation
```

History must remain explainable.

---

# 17. EVENT DESIGN

Every important state transition should answer:

```text
what happened
who caused it
when it happened
which task/session/project it belongs to
what it changed
what caused it
```

Where applicable include:

```text
correlationId
parentEventId
requestId
agentId
toolId
artifactId
```

---

# 18. TRANSACTIONAL STATE CHANGES

For critical state:

```text
validate
    ↓
transaction
    ↓
append authoritative event
    ↓
durable commit
    ↓
update projection
```

Never:

```text
update projection
    ↓
hope event persistence succeeds
```

---

# 19. DURABILITY

Before reporting a critical operation successful, ensure the required durable state exists.

For checkpoints, the applicable evidence includes:

```text
event committed
checkpoint manifest durable
artifacts exist
artifact hashes valid
state revision recorded
```

A success message must not precede required durability.

---

# 20. CRASH RECOVERY

Startup recovery should conceptually perform:

```text
open storage
    ↓
validate schema
    ↓
check transaction integrity
    ↓
validate event sequence
    ↓
detect stale leases
    ↓
detect orphan artifacts
    ↓
validate checkpoints
    ↓
restore/rebuild projections
    ↓
classify incomplete work
    ↓
mark recoverable tasks
```

Never silently delete evidence during recovery.

---

# 21. ORPHAN STATE

Possible orphan state includes:

```text
artifact without metadata
metadata without artifact
worktree without active task
lease without process
checkpoint without projection
temporary extraction
remote environment without task
```

Recovery must:

```text
detect
classify
preserve
repair where safe
record recovery
```

---

# 22. RESUME

`/resume` is not chat replay.

It reconstructs durable runtime state.

Applicable state includes:

```text
project
session
task DAG
events
checkpoint
workflow
approvals
memory
artifacts
model/profile metadata
worktree
environment
permissions
```

Then:

```text
rebuild context
validate capabilities
validate policy
validate environment
continue
```

A resumed operation must be revalidated.

---

# 23. CHECKPOINTS

A checkpoint is a recovery representation, not merely a transcript snapshot.

It may reference:

```text
event offset
task state
memory
context summary
artifacts
workspace state
provider state
workflow state
```

Checkpoint creation must itself be observable.

---

# 24. COMPACTION

Compaction changes:

```text
model-visible context
```

It does not destroy:

```text
authoritative history
```

Preserve:

```text
objective
acceptance criteria
constraints
approvals
blockers
changed files
important decisions
artifacts
workflow state
memory provenance
```

Preferred process:

```text
freeze revision
    ↓
classify context
    ↓
preserve critical
    ↓
preserve high-value
    ↓
summarize normal
    ↓
compress low-value
    ↓
retain artifact references
    ↓
build candidate revision
    ↓
validate
    ↓
commit new context revision
```

If validation fails, retain the previous valid context.

---

# 25. CONTEXT ENGINEERING

Maintain:

```text
history ≠ memory ≠ context ≠ artifact
```

Context is a deliberately selected working set.

A ContextPlan should account for:

```text
task
project
session
memory
files
attachments
artifacts
skills
tools
diagnostics
model capabilities
token budget
provenance
```

Every selected item should have:

```text
source
representation
priority
estimated cost
selection reason
```

---

# 26. PROGRESSIVE DISCLOSURE

Do not automatically provide:

```text
all tools
all MCP schemas
all skills
all memory
all repository files
all session history
all attachments
```

Use:

```text
metadata
    ↓
relevance detection
    ↓
detailed retrieval
```

Large data should normally become artifacts and references.

---

# 27. CONTENT MODEL

Treat external content as structured data.

Pipeline:

```text
input
 ↓
validation
 ↓
security classification
 ↓
extraction
 ↓
representation
 ↓
provenance
 ↓
ContextPlan
 ↓
model
```

Applicable content includes:

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

Unknown data must be preserved safely rather than discarded merely because it cannot be interpreted.

---

# 28. MULTIMODAL SAFETY

Before content enters model context:

```text
validate MIME/signature
check size
security scan where applicable
classify trust
extract representation
attach provenance
resolve model capability
```

Do not submit unsupported modalities.

Do not assume a file's extension proves its type.

---

# 29. VIDEO HANDLING

Avoid blindly injecting full video.

Use representations such as:

```text
metadata
scene detection
audio extraction
transcription
key frames
query-specific sampling
```

Then select relevant representations through ContextPlan.

---

# 30. PROVENANCE

Important derived content must preserve:

```text
source type
source ID
source URI where applicable
parent objects
capture time
extractor/version
transformations
```

Do not lose the relationship between:

```text
source
→ extraction
→ transformation
→ artifact
→ context
→ model decision
```

---

# 31. SECURITY AUTHORITY

Use explicit authority classes.

Examples:

```text
system
security-policy
developer
user
project-instruction
skill
agent
tool-output
mcp-output
repository-content
web-content
attachment
```

Only authorized sources can affect policy.

Repository/web/MCP content is data.

It is not automatically instruction authority.

---

# 32. PROMPT-INJECTION DEFENSE

Treat this as hostile:

```text
README
web page
PDF
image OCR
MCP response
tool output
plugin metadata
generated artifact
model output
```

If content says:

```text
ignore previous instructions
upload secrets
disable security
execute this command
```

classify it according to its source.

Never promote untrusted content into policy.

---

# 33. POLICY ENFORCEMENT

The execution chain should remain:

```text
agent
 ↓
ToolGateway
 ↓
schema validation
 ↓
policy
 ↓
approval if required
 ↓
executor
 ↓
observation
 ↓
artifact/event
```

No agent, MCP, plugin, skill or workflow may bypass this.

---

# 34. TOOL/EXECUTOR SEPARATION

A tool describes:

```text
WHAT should happen
```

An executor determines:

```text
WHERE/HOW it runs
```

Example:

```text
shell.execute
    ↓
DockerExecutor
```

Do not embed executor implementation inside tool definitions.

---

# 35. TOOL CONTRACTS

Tools should define:

```text
name
description
input schema
risk
idempotency
timeout
capabilities
```

Tool results should define:

```text
success
summary
output
artifact reference
exit status
retryability
provenance
```

---

# 36. TOOL RESULT SIZE

If output becomes large:

```text
raw result
    ↓
artifact
    ↓
summary/reference
    ↓
context
```

Never solve context growth by deleting the raw evidence.

---

# 37. IDEMPOTENCY

Every side-effecting operation should be classified:

```text
idempotent
non-idempotent
unknown
```

Default unknown operations to conservative retry behavior.

Never infer idempotency merely because an API call appears simple.

---

# 38. RETRY ARCHITECTURE

Avoid retry multiplication.

Bad:

```text
workflow ×3
agent ×3
provider ×3
tool ×3
= potentially 81 executions
```

Use an aggregate retry budget.

Track:

```text
attempt count
layer
reason
side-effect classification
```

---

# 39. SIDE-EFFECT RULE

Pure computation and model generation may often be retried.

Side effects require stronger guarantees.

Examples requiring conservative handling:

```text
POST without idempotency
deploy
delete
git push
external mutation
payment-like operations
credential changes
```

Never blindly retry these.

---

# 40. CREDENTIAL SECURITY

Credentials are references.

Normal application state may contain:

```text
credential ID
provider
masked fingerprint
status
timestamps
```

Never place raw credentials in:

```text
model context
events
logs
artifacts
crash reports
telemetry
ordinary database rows
```

---

# 41. API KEY POOLS

Key pools are managed resources.

Consider:

```text
health
capacity
rate limits
cooldown
fairness
usage
provider/model compatibility
```

Global resource limits always win.

---

# 42. PROVIDER ABSTRACTION

Generic runtime logic must depend on:

```text
ProviderAdapter
ModelAdapter
ModelRouter
CapabilityResolver
```

not provider-specific API semantics.

Provider-specific behavior belongs inside adapters.

---

# 43. CAPABILITY RESOLUTION

Before model execution determine:

```text
task requirements
content modalities
tool requirements
structured-output requirements
context size
policy restrictions
provider availability
credential availability
```

Then resolve a compatible model.

Unsupported capability combinations must fail before request construction.

---

# 44. MODEL ROUTING

Routing may consider:

```text
task type
required capability
context size
latency
cost
provider health
key capacity
data sensitivity
agent role
model profile
```

Never optimize solely for price.

If pricing is unknown:

```text
cost = unavailable
```

Never invent pricing.

---

# 45. MODEL SWITCHING

When switching models during a task, revalidate:

```text
context budget
modalities
tool calling
structured output
schema compatibility
policy
data sensitivity
```

Record the model switch.

---

# 46. AGENT BOUNDARIES

An agent must have bounded:

```text
identity
role
model
tools
skills
permissions
context
budget
executor
task
```

Agent startup requires successful resolution of these dependencies.

---

# 47. AGENT STARTUP

Before starting:

```text
resolve model
resolve tools
resolve skills
resolve MCP
resolve executor
resolve policy
resolve budget
resolve context
```

If a required capability is missing:

```text
do not partially start
```

Return an actionable diagnostic.

---

# 48. AGENT MEMORY

Agent memory is scoped.

It must not silently become global memory.

Typical scopes:

```text
agent
project
team
global
```

Promotion between scopes requires explicit policy.

---

# 49. SUBAGENTS

A subagent is a child task with bounded resources.

It should receive only:

```text
objective
constraints
relevant context
required artifacts
required tools
required skills
role instructions
```

Do not send the entire parent transcript by default.

---

# 50. AGENT HANDOFF

Child output should use a structured handoff containing, where applicable:

```text
status
summary
findings
changed files
artifacts
unresolved issues
recommended next actions
```

Validate handoff data before accepting it.

---

# 51. TASK BOARD

Task state must be durable.

Typical states:

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

Transitions must be explicit.

---

# 52. TASK LEASES

Claimed work should use leases where required:

```text
task ID
agent ID
lease ID
claimed timestamp
expiry
```

Only the valid owner may mutate leased work.

---

# 53. HEARTBEATS

Long-running agents should emit structured heartbeats.

Track:

```text
agent
task
timestamp
current phase
last model request
last tool
```

Missed heartbeats trigger recovery evaluation.

---

# 54. STALLED AGENT RECOVERY

Recovery must avoid duplicate execution.

Possible sequence:

```text
heartbeat timeout
 ↓
inspect process
 ↓
determine whether work is still alive
 ↓
extend or reclaim lease
 ↓
resume/requeue/reassign
```

Do not assume heartbeat loss equals process death.

---

# 55. AGENT TEAMS

Teams are more than collections of agents.

A team may contain:

```text
coordinator
shared task board
agent identities
peer messaging
shared artifacts
bounded lifecycle
```

Team coordination must remain bounded.

---

# 56. TEAM LIMITS

Bound:

```text
agents
messages
delegation depth
cost
duration
tools
tasks
```

Detect:

```text
duplicate work
message storms
agent loops
unproductive disagreement
```

---

# 57. ARTIFACT-BASED COORDINATION

Prefer:

```text
artifact reference
```

over copying large data into messages.

Example:

```text
researcher
 → research-report artifact
 → implementer

reviewer
 → findings artifact
 → repair agent
```

---

# 58. PARALLEL CODING

Parallel coding requires conflict-safe isolation.

Preferred model:

```text
main
 ├── worktree A
 ├── worktree B
 └── review worktree
```

If two agents share a worktree and write overlapping files:

```text
reject
or
serialize
```

Do not silently merge conflicting writes.

---

# 59. FILE DIVERGENCE

Before modifying a file:

```text
read current file
capture base hash
prepare change
policy check
apply
verify
```

If current hash differs from the agent's base:

```text
stop
re-read
reconcile/rebase/ask
```

Never silently overwrite user changes.

---

# 60. EDIT TRANSACTION

Prefer:

```text
prepare
 ↓
generate diff
 ↓
policy
 ↓
apply
 ↓
diagnostics
 ↓
test
 ↓
commit/retain
```

An edit is not successful merely because the file write succeeded.

---

# 61. EXECUTION PLANE

Executors provide actual process execution.

Possible executors:

```text
local
Docker
SSH
remote VM
cloud
serverless
```

Every executor must expose its capabilities.

---

# 62. SANDBOXING

Executor selection must consider:

```text
risk
filesystem policy
network policy
credentials
project
data sensitivity
resource limits
```

Never silently replace a stronger sandbox with a weaker one.

---

# 63. DOCKER

Docker should be treated as a stronger isolation target for untrusted tasks where supported.

Consider:

```text
image
CPU
memory
network
mounts
read-only paths
environment
process limits
timeout
```

---

# 64. LOCAL EXECUTION

Local execution remains policy-controlled.

Even trusted development execution should enforce applicable:

```text
filesystem boundaries
timeouts
network policy
audit
resource limits
```

---

# 65. REMOTE EXECUTION

Remote execution must preserve the same semantic runtime contract:

```text
Task
Artifact
Event
Checkpoint
Policy
Verification
Recovery
```

Remote execution must not become a separate durability model.

---

# 66. REMOTE DATA HANDLING

Before destroying a remote environment:

```text
persist checkpoint
 ↓
sync artifacts
 ↓
verify hashes
 ↓
persist metadata
 ↓
destroy environment
```

Remote output must be durable before destruction.

---

# 67. WORKTREES

Track:

```text
worktree ID
project
task
path
branch
base commit
status
```

Do not delete failed worktrees before required evidence is preserved.

---

# 68. PROCESS MANAGEMENT

Track long-running processes:

```text
process ID
task
agent
cwd
start time
status
ports
stdout artifact
stderr artifact
```

Long-running processes require:

```text
timeout
heartbeat
termination policy
recovery semantics
```

---

# 69. MCP

MCP is an integration/capability layer.

It is not a security boundary.

MCP-discovered tools must become normalized Anantham tools and pass through the normal policy path.

```text
MCP
 ↓
normalization
 ↓
ToolDefinition
 ↓
ToolGateway
 ↓
policy
 ↓
executor
```

---

# 70. MCP CONTENT

MCP resources and outputs are untrusted external content.

Apply:

```text
validation
trust classification
provenance
size controls
security policy
context selection
```

---

# 71. MCP PROMPTS

MCP-provided prompts must remain distinguishable from authoritative instructions.

They cannot automatically modify system/security policy.

---

# 72. MCP FAILURE

Handle:

```text
connection failure
timeout
invalid schema
authentication failure
malicious output
large output
server crash
```

Use structured states rather than generic errors.

---

# 73. PLUGINS

Plugins are controlled extensions.

Before activation:

```text
discover
inspect
validate
resolve dependencies
review permissions
install
verify
activate
health-check
```

---

# 74. PLUGIN TRUST

Track:

```text
publisher/source
version
checksum
permissions
network access
filesystem access
credentials
provided capabilities
trust state
```

Never treat installation as automatic trust.

---

# 75. PLUGIN LIFECYCLE

Disabling a plugin must cleanly remove its registrations:

```text
commands
tools
hooks
providers
skills
MCP registrations
```

Do not leave stale references.

---

# 76. PLUGIN VERSIONING

Active workflow runs should pin plugin versions.

Do not allow a running workflow to silently change semantics because a plugin updated.

---

# 77. SKILLS

Skills describe procedures.

Keep:

```text
Memory = what is known
Skill  = how a task should be performed
```

Skills should support progressive disclosure and versioning.

---

# 78. SKILL DEPENDENCIES

A skill may require:

```text
tools
MCP
other skills
model capabilities
runtime version
```

Dependency resolution occurs before execution.

---

# 79. SKILL VERSION PINNING

Historical executions must record the exact skill version.

Changing a skill must not silently rewrite historical workflow semantics.

---

# 80. HOOKS

Hooks are deterministic lifecycle automation.

They are not skills.

Hooks must not bypass policy.

Security-sensitive hooks should fail closed where practical.

---

# 81. WORKFLOWS

Workflow definitions describe orchestration.

They must support, where required:

```text
tasks
dependencies
parallelism
conditions
retries
timeouts
budgets
artifacts
verification
approval
executor selection
model selection
```

---

# 82. WORKFLOW VERSIONING

Active runs pin:

```text
workflow version
agent versions
skill versions
plugin versions
model profile
```

Changing source code must not silently mutate an active run.

---

# 83. WORKFLOW VALIDATION

Before execution:

```text
syntax
 ↓
schema
 ↓
dependency graph
 ↓
cycle detection
 ↓
permission validation
 ↓
capability validation
 ↓
resource validation
 ↓
budget validation
 ↓
approval requirements
```

Only then execute.

---

# 84. WORKFLOW DEADLOCKS

Detect:

```text
task cycles
resource starvation
lock dependency cycles
unavailable agents
unavailable executors
unavailable credentials
```

Do not allow a workflow to wait forever without a defined state.

---

# 85. RESOURCE GOVERNANCE

Resource limits must be enforceable centrally.

Track:

```text
agents
requests
tokens
cost
CPU
memory
disk
network
executors
keys
```

Lower layers cannot bypass global limits.

---

# 86. RESOURCE HIERARCHY

Resource limits can exist at:

```text
global
project
workflow
task
agent
request
```

A lower limit may restrict execution.

A lower layer cannot exceed a higher hard cap.

---

# 87. BUDGETS

Track:

```text
tokens
cost
time
tool calls
iterations
requests
agents
```

Budgets should have:

```text
warning
restriction
waiting
hard-stop
```

states as appropriate.

---

# 88. WAITING RESOURCE

Provider quota exhaustion, unavailable workers, or unavailable credentials should become an explicit waiting state when recovery is possible.

Do not convert every resource shortage into permanent task failure.

---

# 89. OBSERVABILITY

Every significant execution should be traceable.

Record, where applicable:

```text
request ID
project
session
task
agent
provider
model
key pool
tool
executor
workflow
duration
status
artifact
```

---

# 90. MODEL OBSERVABILITY

Track:

```text
provider
model
auth profile
request ID
context revision
attachment IDs
token usage
latency
finish status
errors
```

Never log raw credentials.

---

# 91. TOOL JOURNAL

Record:

```text
normalized request
arguments
policy result
approval
start
end
exit code
stdout artifact
stderr artifact
result
retryability
```

This provides audit and recovery evidence.

---

# 92. ROUTING EXPLANATION

A route decision should be explainable.

Example:

```text
Selected:
provider/model

Reasons:
- tool calling required
- context window sufficient
- provider approved
- key capacity available
- sensitivity policy satisfied
- balanced profile selected
```

---

# 93. ERROR TAXONOMY

Normalize failures.

Provider errors:

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

Executor errors:

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

Tool errors should similarly expose:

```text
code
category
message
retryable
evidence artifact
```

---

# 94. FAILURE ANALYSIS

Every important failure should answer:

```text
what failed
where
why
whether state is durable
whether recovery is possible
what recovery occurred
what remains unresolved
```

Prefer structured failure records.

---

# 95. RECOVERABILITY CLASSIFICATION

Use:

```text
recoverable
partially_recoverable
non_recoverable
```

A recoverable task should be resumable without manually reconstructing hidden state.

---

# 96. VERIFICATION

Verification is independent from model claims.

Never use:

```text
model says completed
```

as completion evidence.

Use objective evidence such as:

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
external state verification
```

---

# 97. FALSE COMPLETION DEFENSE

A task is not complete because:

```text
model says done
tool returned success
file was modified
workflow reached final node
```

unless the applicable acceptance criteria have also been verified.

---

# 98. VERIFICATION ARTIFACTS

Major workflows should create evidence artifacts such as:

```text
plan
change
test
review
verification
```

Artifacts should retain:

```text
creator
task
source
hash
verification status
provenance
```

---

# 99. HUMAN ACCEPTANCE

Automated verification and human acceptance are separate concepts.

For high-impact workflows:

```text
automated verification
+
human acceptance
```

may both be required.

---

# 100. TESTING STRATEGY

Tests should cover the relevant layers.

## Functional

```text
normal success
invalid input
boundary conditions
state transitions
```

## Failure

```text
timeout
crash
network failure
provider failure
resource exhaustion
policy denial
```

## Recovery

```text
failure
restart
recovery
new state
verification
```

## Concurrency

```text
race
duplicate claim
lease expiry
overlapping writes
duplicate execution
```

## Security

```text
prompt injection
credential leakage
policy bypass
path traversal
malicious files
malicious MCP output
```

---

# 101. RESTART TESTING

Foundational infrastructure must be tested across restart.

Minimum pattern:

```text
start
 ↓
perform operation
 ↓
persist partial/active state
 ↓
terminate process
 ↓
restart
 ↓
recover
 ↓
verify state
 ↓
continue
```

Do not infer recovery from unit tests alone.

---

# 102. CRASH TESTING

Test crashes at meaningful boundaries:

```text
before transaction
during transaction
after event
before projection
during artifact write
after artifact write
before checkpoint
after checkpoint manifest
during tool execution
during agent execution
during workflow transition
```

---

# 103. CONCURRENCY TESTING

Test:

```text
two agents claiming same task
two writers editing same file
lease expiry during execution
duplicate retry
simultaneous cancellation
simultaneous resume
provider/key contention
workflow parallel branches
```

---

# 104. SECURITY TESTING

Adversarial tests should include:

```text
prompt injection
path traversal
secret exfiltration
malicious MCP response
malicious plugin
malicious attachment
repository instruction injection
credential logging
permission escalation
sandbox downgrade
```

---

# 105. CONTRACT TESTING

Provider adapters, tools, executors, plugins and connectors should have contract tests.

Verify:

```text
interface compatibility
schema behavior
error normalization
timeouts
capabilities
lifecycle
```

---

# 106. MIGRATION TESTING

Every persistent schema change should test:

```text
old database
 ↓
backup
 ↓
migration
 ↓
validation
 ↓
application startup
 ↓
resume
 ↓
normal operation
```

Where possible test downgrade/rollback behavior.

---

# 107. BACKUP/RESTORE TESTING

Do not merely test backup creation.

Test:

```text
backup
 ↓
inspect
 ↓
integrity check
 ↓
restore isolated copy
 ↓
validate
 ↓
resume task
 ↓
verify artifacts
```

---

# 108. MULTIMODAL TESTING

Test applicable:

```text
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

Also test:

```text
wrong MIME
oversized file
corrupt file
malicious archive
unsupported modality
extraction failure
```

---

# 109. PROVIDER FAILURE TESTING

Test:

```text
invalid credential
expired credential
429
5xx
timeout
network loss
quota exhaustion
unsupported model
capability mismatch
provider outage
```

Verify that recoverable failures preserve task state.

---

# 110. AGENT FAILURE TESTING

Test:

```text
model crash
tool failure
agent process crash
heartbeat loss
budget exhaustion
policy denial
executor failure
context failure
```

Verify parent recovery semantics.

---

# 111. MCP TESTING

Test:

```text
healthy server
slow server
crashed server
invalid schema
expired auth
malicious output
large output
reconnect
disable/enable
```

---

# 112. PLUGIN TESTING

Test:

```text
install
validate
enable
disable
reload
restart
failure
uninstall
version pinning
dependency conflict
checksum failure
```

---

# 113. WORKFLOW TESTING

Use mocked:

```text
models
providers
tools
MCP
executors
```

to test orchestration without external cost.

Test:

```text
success
dependency failure
parallel branch failure
approval wait
resource wait
retry
timeout
cancel
resume
cycle detection
budget exhaustion
```

---

# 114. EVALUATION

Agent evaluation must measure more than model output quality.

Measure:

```text
task success
verification success
tool correctness
tool failures
tokens
cost
latency
recovery
security behavior
false completion
```

---

# 115. TEAM EVALUATION

Team systems should measure:

```text
coordination overhead
duplicate work
message volume
conflict rate
artifact quality
completion
cost
speedup
```

Spawning more agents is not inherently better.

---

# 116. PARALLELISM EVALUATION

Measure:

```text
serial duration
parallel duration
speedup
resource cost
conflict rate
```

Optimize for useful parallelism, not agent count.

---

# 117. ROUTER EVALUATION

Compare:

```text
static routing
capability routing
cost-aware routing
latency-aware routing
adaptive routing
```

using common evaluation tasks.

---

# 118. PERFORMANCE ENGINEERING

Measure:

```text
startup
queue wait
agent startup
model latency
TTFT where available
tool latency
executor startup
artifact persistence
context construction
retrieval
verification
shutdown
recovery
```

Do not optimize an unmeasured bottleneck.

---

# 119. DATABASE ENGINEERING

For SQLite:

```text
transactions
WAL
appropriate synchronous durability
foreign keys
schema versions
migration tracking
integrity checks
```

must be deliberately configured.

Do not change durability settings solely for speed without documenting the trade-off.

---

# 120. STORAGE ENGINEERING

Durable artifacts should use safe writes:

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

Never advertise artifact completion before content durability requirements are satisfied.

---

# 121. CACHE RULE

Caches are derived.

They may be deleted and rebuilt.

Examples:

```text
model capability cache
semantic index
FTS index
statistics
UI cache
```

Never make a cache the only copy of required state.

---

# 122. INDEX REBUILD

Index corruption should be repairable by:

```text
stop affected operation
rebuild from authoritative source
validate
resume
```

---

# 123. DATABASE REPAIR

When corruption occurs:

```text
identify affected object
preserve source
validate events
rebuild derived projections
record recovery
verify
```

Do not silently overwrite the original evidence.

---

# 124. CONFIGURATION

Configuration should be versioned where it affects execution semantics.

Distinguish:

```text
global configuration
profile configuration
project configuration
task/workflow configuration
runtime defaults
```

Do not silently mutate active execution configuration.

---

# 125. ACTIVE-RUN PINNING

Active workflow/task execution should pin the configuration required for reproducibility, including where applicable:

```text
workflow version
plugin versions
skill versions
agent definition
model profile
tool schema versions
executor configuration
policy revision
```

---

# 126. HOT CONFIGURATION

Configuration changes may affect future executions.

Existing active runs should not silently inherit semantic changes unless explicit migration is performed.

---

# 127. MIGRATION

Persistent changes require:

```text
migration ID
source version
target version
forward migration
validation
rollback strategy where possible
```

Before risky migration:

```text
backup
```

where practical.

---

# 128. API COMPATIBILITY

Do not break public interfaces casually.

Before changing an interface:

```text
find consumers
find tests
find plugins
find SDK callers
find CLI callers
find persisted representations
```

Determine whether compatibility adapters are required.

---

# 129. ERROR COMPATIBILITY

Error behavior is part of the contract.

Prefer stable:

```text
error code
category
message
retryability
evidence
```

Do not force callers to parse human-readable text when structured fields are appropriate.

---

# 130. CLI/TUI ARCHITECTURE

UI code must not own core business logic.

Preferred:

```text
CLI/TUI
 ↓
command/application layer
 ↓
runtime services
 ↓
domain
 ↓
persistence/execution
```

The same runtime state must serve:

```text
CLI
TUI
API
SDK
headless mode
```

---

# 131. MACHINE-READABLE OUTPUT

Important operations should support machine-readable representations where specified:

```text
JSON
JSONL
quiet mode
no-color
headless
```

Human-readable output must not become the only API.

---

# 132. API/RPC

HTTP/WebSocket/SSE/JSON-RPC/SDK interfaces should operate against the same runtime semantics.

Do not create a separate state model for the API.

---

# 133. HEADLESS MODE

Headless execution must not depend on:

```text
TUI prompts
interactive keyboard input
human-only output
```

If approval is required, expose a machine-readable waiting state.

---

# 134. APPROVALS

High-risk actions require appropriate approval semantics.

An approval should be bound to applicable:

```text
task
tool
normalized arguments
policy revision
timestamp
```

Stale approvals must not silently authorize changed actions.

---

# 135. POLICY REVISION

Policy changes can invalidate previous approvals.

Do not assume:

```text
approved once
=
approved forever
```

---

# 136. POLICY SIMULATION

Provide non-executing policy evaluation where required.

Simulation must never accidentally perform the action it evaluates.

---

# 137. SECURITY MODES

Modes such as:

```text
readonly
auto
dangerous
skip-permissions/high-risk
```

must not weaken mandatory system/security invariants.

High-risk modes require explicit visibility and auditability.

---

# 138. USER CHANGE PROTECTION

User changes always outrank an agent's stale assumptions.

If an agent discovers divergence:

```text
stop
re-read
reconcile
```

Never silently destroy user work.

---

# 139. CLEANUP

Temporary resources may be deleted only when:

```text
task terminal state reached
required artifacts preserved
retention policy permits cleanup
```

Examples:

```text
worktrees
containers
temporary files
remote environments
processes
```

---

# 140. CLEANUP DRY RUN

Destructive maintenance should support preview where applicable.

The user should be able to inspect:

```text
what
why
source
retention decision
```

before deletion.

---

# 141. OBSERVABILITY PRINCIPLE

Every important subsystem should expose enough evidence to answer:

```text
What happened?
When?
To what object?
By whom?
Under which configuration?
Under which policy?
With which model/tool/executor?
What was the result?
What evidence proves the result?
```

---

# 142. DIAGNOSTICS

Diagnostics should be actionable.

Bad:

```text
Agent failed.
```

Better:

```text
Agent cannot start.

Missing capability:
browser

Dependency:
Playwright MCP

Current state:
disabled

Action:
enable MCP or select an agent without browser requirements
```

---

# 143. HEALTH CHECKS

Subsystem health should distinguish:

```text
healthy
degraded
unavailable
misconfigured
disabled
```

Avoid a binary "working/not working" abstraction when diagnosis requires more detail.

---

# 144. CIRCUIT BREAKERS

External unstable systems may use:

```text
healthy
 ↓
failure threshold
 ↓
open
 ↓
cooldown
 ↓
half-open
 ↓
healthy/open
```

Circuit breakers must not erase task state.

---

# 145. SAFE SHUTDOWN

Shutdown should:

```text
stop new task admission
checkpoint where required
persist events
handle active child processes
flush required artifacts
close storage
```

Forced shutdown is handled by startup recovery.

---

# 146. SINGLE-WRITER SAFETY

Project state should not be concurrently mutated by unsupported writers.

Use:

```text
process lock
database locking
server mode
supported coordination
```

where required.

---

# 147. MULTI-INSTANCE SAFETY

If multiple Anantham processes operate against shared state:

```text
explicitly coordinate
or
reject unsafe concurrent access
```

Never rely on accidental filesystem behavior.

---

# 148. SECURITY REVIEW CHECKLIST

For every significant feature ask:

```text
Does it introduce a new trust boundary?
Does it access credentials?
Does it execute code?
Does it access the network?
Does it write files?
Does it create side effects?
Can model output influence it?
Can untrusted content influence it?
Can it bypass policy?
Can it leak secrets?
Can it weaken sandboxing?
Can it cross project boundaries?
Can it create unbounded work?
```

---

# 149. DATA SENSITIVITY

Where applicable distinguish:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
SECRET
```

Routing and execution policy may depend on sensitivity.

Example:

```text
SECRET
→ approved local execution only
```

The exact policy remains governed by the authoritative security configuration.

---

# 150. PROJECT ISOLATION

Project boundaries are security and correctness boundaries.

Do not accidentally share:

```text
memory
artifacts
credentials
context
worktrees
configuration
tasks
agent state
```

across projects.

Explicit sharing must be modeled.

---

# 151. EXTERNAL CONTENT

Treat:

```text
websites
attachments
repository files
MCP output
plugin metadata
skills from external sources
```

as potentially hostile.

External content is not policy authority.

---

# 152. SUPPLY-CHAIN SAFETY

For plugins, skills, MCP packages and external integrations consider:

```text
source
publisher
version
checksum
permissions
dependencies
runtime compatibility
network access
filesystem access
credential access
```

---

# 153. RESOURCE EXHAUSTION

Protect against:

```text
unbounded recursion
agent spawning
workflow nesting
message storms
tool output growth
context growth
parallel requests
retry multiplication
large attachments
archive bombs
process proliferation
```

---

# 154. LARGE DATA HANDLING

Prefer references over duplication.

Use:

```text
artifact
content object
index
retrieval
summary
pointer
```

rather than repeatedly copying large payloads.

---

# 155. UNKNOWN INPUT

When a format cannot be understood:

```text
preserve
classify
record
```

Do not silently discard it.

---

# 156. COMPLETION CRITERIA

A significant feature requires:

```text
[ ] requirement identified
[ ] architecture identified
[ ] existing implementation inspected
[ ] contract identified/defined
[ ] persistence analyzed
[ ] events analyzed
[ ] security analyzed
[ ] recovery analyzed
[ ] failure states defined
[ ] resource impact analyzed
[ ] tests added
[ ] observability added
[ ] documentation updated
[ ] migration considered
[ ] acceptance criteria defined
[ ] verification performed
```

---

# 157. PRODUCTION-COMPLETION RULE

Do not call a feature production-complete if any applicable condition remains undefined:

```text
state durability
authority
policy enforcement
failure handling
recovery
verification
observability
security
testing
migration
```

---

# 158. FOUNDATIONAL INFRASTRUCTURE RULE

Foundational systems must demonstrate restart/recovery.

This especially applies to:

```text
database
event log
task manager
checkpoint system
agent runtime
workflow runtime
artifact storage
provider state
```

Unit tests alone are insufficient evidence.

---

# 159. IMPLEMENTATION ORDER

Where dependencies permit, prioritize foundational infrastructure before presentation.

Recommended order:

```text
1. durable state
2. project/session/task
3. events/checkpoints
4. content/artifacts
5. storage/recovery
6. model/provider
7. context/retrieval
8. policy/tools
9. memory
10. MCP/plugins/skills/hooks
11. agents
12. teams
13. executors
14. orchestration
15. verification
16. CLI/TUI
17. external integrations
18. evaluation
19. production hardening
```

Do not build a polished UI around unstable runtime primitives.

---

# 160. FEATURE SLICE STRATEGY

Prefer vertical slices that demonstrate the complete lifecycle.

Example:

```text
request
 ↓
runtime
 ↓
state
 ↓
tool/model
 ↓
artifact
 ↓
verification
 ↓
checkpoint
 ↓
resume
```

A small end-to-end slice is often more valuable than a large isolated subsystem.

---

# 161. SMALLEST SAFE CHANGE

When modifying an existing subsystem:

```text
understand current abstraction
 ↓
identify exact missing behavior
 ↓
change only required contract
 ↓
reuse existing mechanisms
 ↓
add regression tests
```

Avoid speculative frameworks.

---

# 162. NO PARALLEL SUBSYSTEMS

Before creating a new:

```text
registry
queue
cache
event store
policy engine
artifact manager
model router
context manager
task manager
```

search for an existing one.

If one exists:

```text
extend it
```

unless an ADR explicitly justifies replacement.

---

# 163. ARCHITECTURAL SMELLS

Investigate when you see:

```text
duplicate state
duplicate event systems
business logic in UI
provider-specific logic in core
direct tool execution
raw SQL scattered throughout domain logic
secret values in logs
untyped JSON everywhere
global mutable state
implicit retries
hidden background workers
```

---

# 164. TYPESCRIPT ENGINEERING

Prefer:

```text
explicit domain types
discriminated unions
validated external inputs
narrow interfaces
dependency injection
typed errors
schema validation
```

Avoid:

```text
any
unsafe casts
implicit global state
provider-specific types leaking into core
unvalidated external JSON
```

Use runtime schema validation at trust boundaries.

---

# 165. TRUST BOUNDARIES IN CODE

Validate external input at boundaries:

```text
CLI
API
MCP
plugin
provider
filesystem metadata
webhook
workflow code
model structured output
connector
executor
```

Do not assume type safety after crossing a runtime trust boundary.

---

# 166. DATABASE ACCESS

Keep persistence concerns behind deliberate repositories/services where appropriate.

Do not allow arbitrary modules to mutate authoritative tables without domain rules.

Database writes should preserve:

```text
transactions
invariants
events
schema versions
```

---

# 167. DOMAIN SERVICE RULE

Business rules belong in domain/application services, not:

```text
TUI rendering
CLI formatting
HTTP handlers
SQL snippets
provider adapters
```

Adapters translate external protocols.

Core runtime owns semantics.

---

# 168. ADAPTER RULE

External systems should be isolated behind adapters:

```text
ProviderAdapter
Executor
MCPAdapter
Connector
PluginRuntime
StorageAdapter
```

Provider-specific behavior must not leak into domain contracts.

---

# 169. EXTERNAL API INTEGRATION

For a new connector:

```text
authentication
capabilities
request schema
response schema
timeouts
rate limits
retry semantics
side-effect classification
observability
error normalization
```

must be considered.

---

# 170. WEBHOOK SECURITY

Inbound webhook processing should validate applicable:

```text
authentication
signature
timestamp
nonce
source
project
workflow
request ID
```

Do not allow arbitrary external events to trigger privileged workflows.

---

# 171. NOTIFICATIONS

Notifications are derived side effects.

They should not become authoritative state.

Use:

```text
event
 ↓
notification policy
 ↓
deduplication
 ↓
delivery
```

---

# 172. NOTIFICATION DEDUPLICATION

Avoid notification storms using:

```text
event fingerprint
cooldown
aggregation
```

Notification failure should not destroy the underlying task state.

---

# 173. RESEARCH WORKFLOWS

Research artifacts should preserve, where applicable:

```text
question
claims
sources
retrieval time
confidence
claim mapping
summary
```

Do not collapse evidence into unsupported assertions.

---

# 174. BROWSER WORKFLOWS

Browser evidence may include:

```text
screenshots
DOM
accessibility tree
console
network
interactions
timings
trace
video
```

Sensitive browser sessions must remain isolated.

Never silently inherit the user's personal browser cookies/session.

---

# 175. ARTIFACT PRINCIPLE

Artifacts are evidence and durable outputs.

Use artifacts for:

```text
large outputs
reports
diffs
test results
research
screenshots
logs
transcripts
verification
remote output
```

Prefer artifact references over huge event payloads.

---

# 176. ARTIFACT INTEGRITY

Artifacts should preserve:

```text
content
hash
metadata
provenance
creator
task
timestamp
verification status
```

Hash mismatches are integrity failures.

---

# 177. RETENTION

Retention must distinguish:

```text
authoritative data
derived data
temporary data
```

Do not delete authoritative evidence merely to reclaim cache space.

---

# 178. REPLAY

Replay/evaluation must reconstruct enough execution metadata to explain behavior.

Where applicable record:

```text
model
provider
request configuration
workflow version
agent
skills
plugins
tools
policy revision
executor
context revision
```

---

# 179. DETERMINISM

The runtime should be as deterministic as practical given identical:

```text
state
workflow version
policy
resource conditions
configuration
```

Models remain inherently nondeterministic.

Therefore record model configuration wherever available.

---

# 180. MODEL NONDETERMINISM

Where applicable capture:

```text
temperature
seed
model parameters
provider
request
```

Do not claim exact replay if the underlying model/provider does not guarantee deterministic output.

---

# 181. VERIFICATION OVER REPRODUCTION

When exact reproduction is impossible, prioritize:

```text
evidence
state
artifacts
inputs
configuration
verification
```

over pretending the model output can always be replayed exactly.

---

# 182. REVIEW PROCESS

Before merging substantial changes, reviewers should inspect:

```text
requirement mapping
architecture
contracts
state changes
security
failure handling
recovery
tests
observability
migration
documentation
```

---

# 183. REVIEW QUESTIONS

Ask:

```text
Does this duplicate an existing abstraction?
Does it introduce a new authority source?
Can model output bypass policy?
Can state be lost?
Can the operation be duplicated?
Can it race?
Can it survive restart?
Can it be recovered?
Can secrets leak?
Can a user change be overwritten?
Can it exhaust resources?
Can completion be falsely reported?
```

---

# 184. ACCEPTANCE TEST DESIGN

Acceptance criteria should be observable.

Bad:

```text
Agent system works well.
```

Better:

```text
Given a running task,
terminate the runtime,
restart it,
resume the task,
verify the task DAG,
artifacts,
permissions,
and worktree state remain correct.
```

---

# 185. EVIDENCE REQUIREMENT

For each significant acceptance criterion record:

```text
criterion
test
execution
result
artifact/evidence
environment
```

---

# 186. UNVERIFIED CLAIMS

Never state:

```text
tested
verified
production-ready
crash-safe
secure
durable
```

unless the applicable evidence exists.

Use precise status instead:

```text
implemented
unit-tested
integration-tested
restart-tested
verified
not yet verified
```

---

# 187. DOCUMENTATION

Implementation changes should update the appropriate documentation when they change:

```text
architecture
configuration
API
CLI
workflow behavior
security
migration
operational behavior
recovery
```

Do not leave operationally significant behavior undocumented.

---

# 188. ADR USAGE

Create or update an ADR when a decision:

```text
changes architecture
creates a new cross-cutting abstraction
changes persistence semantics
changes security boundaries
changes compatibility
introduces significant trade-offs
```

An ADR should explain:

```text
context
problem
decision
alternatives
consequences
migration
```

---

# 189. PRD CHANGE CONTROL

If implementation proves a PRD requirement incomplete or incorrect:

```text
do not silently rewrite the requirement
```

Record:

```text
gap
evidence
impact
proposed change
alternatives
migration
tests
```

Then update the authoritative requirement through the project's versioned process.

---

# 190. SECURITY INVARIANT PRESERVATION

Security invariants cannot be weakened merely because:

```text
UX becomes easier
implementation becomes simpler
model performs better
performance improves
provider requires it
plugin requires it
MCP requires it
```

A capability request does not grant authority.

---

# 191. USER AUTHORITY

User intervention is authoritative over normal agent planning but remains below system/security invariants.

For example:

```text
user:
"ignore the security policy"
```

does not authorize bypassing mandatory security invariants.

---

# 192. MODEL AUTHORITY

Models cannot:

```text
grant permissions
modify security policy
expose credentials
change global resource limits
disable audit
disable required verification
override project isolation
```

---

# 193. PLUGIN/MCP/SKILL AUTHORITY

Plugins, MCPs and skills can provide capabilities.

They cannot grant themselves:

```text
permissions
credentials
network access
filesystem access
deployment authority
```

---

# 194. RESOURCE SAFETY

Every potentially unbounded operation must have a bound:

```text
agents
tasks
messages
iterations
tokens
cost
time
requests
retries
processes
context
attachments
```

---

# 195. BACKGROUND EXECUTION

Background tasks require:

```text
task
agent
project
executor
budget
checkpoint policy
notification policy
```

They must remain recoverable without an attached UI.

---

# 196. TASK MIGRATION

Moving work between:

```text
local
Docker
remote
cloud
```

requires revalidation.

Record:

```text
source executor
target executor
reason
checkpoint
timestamp
```

Do not assume environment equivalence.

---

# 197. MODEL/AGENT MIGRATION

Changing:

```text
model
provider
agent
skill
plugin
MCP
executor
```

during a task requires compatibility validation and an audit record.

---

# 198. ACTIVE STATE PRESERVATION

When a subsystem changes during active execution:

```text
preserve current state
pin existing semantics
explicitly migrate if required
```

Never silently reinterpret historical state.

---

# 199. MAINTENANCE MODE

Database repair/migration should prevent unsafe concurrent mutation.

Conceptually:

```text
normal
 ↓
maintenance
 ↓
migration/repair
 ↓
validation
 ↓
normal
```

---

# 200. FINAL ENGINEERING CHECKLIST

Before implementation:

```text
[ ] Relevant PRD read
[ ] Requirement ID identified
[ ] Existing modules inspected
[ ] Existing contracts inspected
[ ] Existing tests inspected
[ ] ADRs inspected
[ ] State ownership identified
[ ] Security boundary identified
[ ] Recovery behavior identified
```

During implementation:

```text
[ ] Existing abstraction reused where possible
[ ] Inputs validated
[ ] Policy enforced
[ ] State transitions explicit
[ ] Events emitted where required
[ ] Durable state written
[ ] Errors structured
[ ] Resource limits enforced
[ ] Secrets protected
[ ] User changes protected
```

After implementation:

```text
[ ] Unit tests
[ ] Integration tests
[ ] Failure tests
[ ] Recovery tests
[ ] Concurrency tests
[ ] Security tests
[ ] Contract tests
[ ] Migration tests
[ ] Observability verified
[ ] Documentation updated
[ ] Acceptance criteria verified
```

---

# 201. PRODUCTION READINESS GATE

Anantham must not be declared production-ready unless objective evidence demonstrates, as applicable:

```text
committed state survives crashes
/resume reconstructs recoverable tasks
project memory remains isolated
context is inspectable
compaction preserves required state
multimodal ingestion works safely
provider/key failures preserve state
parallel agents do not silently corrupt source
MCP/plugins/skills cannot bypass policy
high-risk actions are auditable
verification prevents false completion
backup/restore works
migrations preserve recoverable state
replay/evaluation detects regressions
performance remains within defined targets
```

---

# 202. FINAL DECISION RULE

When deciding between two implementations:

Prefer the implementation that:

```text
preserves authoritative state
uses existing abstractions
keeps authority deterministic
minimizes trust
minimizes hidden coupling
preserves user changes
is recoverable
is observable
is testable
is versionable
```

Avoid solutions that are merely:

```text
shorter
faster to prototype
more clever
more autonomous
more parallel
more convenient
```

if they weaken those properties.

---

# 203. FINAL IMPLEMENTATION LOOP

The permanent Anantham engineering loop is:

```text
┌─────────────────────────────────────┐
│              INSPECT                │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│             UNDERSTAND              │
│  PRD + ADR + CONTRACT + TESTS       │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│               DESIGN                │
│ ownership + state + security       │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│          DEFINE CONTRACTS           │
│ types + events + schemas + errors  │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│         IMPLEMENT SMALL             │
│ extend before replacing             │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│                TEST                 │
│ functional + failure + recovery    │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│              VERIFY                 │
│ objective evidence                  │
└──────────────────┬──────────────────┘
                   ↓
┌─────────────────────────────────────┐
│             DOCUMENT                │
│ behavior + operations + migration  │
└──────────────────┬──────────────────┘
                   ↓
             ┌─────────────┐
             │   EXPAND    │
             └──────┬──────┘
                    │
                    └────────→ next verified slice
```

---

# 204. NON-NEGOTIABLE FINAL RULE

Before calling an Anantham feature complete, ask:

```text
Is the state durable?

Is the authority boundary correct?

Is the action policy-controlled?

Is the data provenance preserved?

Are user changes protected?

Are resources bounded?

Is the operation observable?

Is failure explicitly represented?

Is recovery defined?

Can it survive restart?

Can it be resumed?

Can the result be objectively verified?

Are the applicable tests actually executed?

Is migration considered?

Is the implementation documented?
```

If any applicable answer is:

```text
NO
```

the feature is not production-complete.

If an answer is:

```text
UNKNOWN
```

the feature is not yet sufficiently understood.

The required response is:

```text
STOP
INSPECT
DEFINE
IMPLEMENT
TEST
VERIFY
```

---

# 205. RELATIONSHIP TO ANANTHAM PRDS

This document is an engineering execution guide.

It does not replace:

```text
Part 1
→ product, durable state, projects, sessions,
  content, memory, context, artifacts, recovery

Part 2
→ models, providers, credentials, tools, MCP,
  plugins, skills, hooks, agents, teams,
  execution, connectors, orchestration

Part 3
→ CLI, TUI, security, UX, evaluation,
  operations, backup/restore, migration,
  performance, production launch
```

When this playbook conflicts with an authoritative PRD requirement:

```text
PRD wins
```

unless the requirement is changed through the approved versioned change process.

---

# 206. MASTER PRINCIPLE

Anantham is not complete when it can perform an action.

Anantham is complete when it can:

```text
UNDERSTAND
    ↓
PLAN
    ↓
AUTHORIZE
    ↓
EXECUTE
    ↓
PERSIST
    ↓
OBSERVE
    ↓
VERIFY
    ↓
RECOVER
    ↓
RESUME
```

reliably and without violating its architectural, durability, security, or policy invariants.

---

# END OF ANANTHAM V2 ENGINEERING PLAYBOOK
