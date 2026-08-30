# ANANTHAM PRD V2 — PART 3
## CLI, TUI, Multimodal UX, Security, Privacy, Evaluation, Performance, Operations, Installation, Migration and Production Launch

**Product:** Anantham  
**Version:** 2.0 — Part 3 of 3  
**Status:** Production Requirements Specification  
**Date:** 2026-08-30  
**Depends on:**  
- `ANANTHAM_PRD_V2_PART_1_PRODUCT_AND_ARCHITECTURE.md`
- `ANANTHAM_PRD_V2_PART_2_AGENTS_INTEGRATIONS_AND_EXECUTION.md`

**Primary goals of Part 3:**

- define the complete user-facing command surface;
- define the TUI/CLI/API behavior;
- define multimodal interaction;
- define security and privacy;
- define diagnostics and audit;
- define evaluation and replay;
- define performance requirements;
- define backup/recovery operations;
- define installation/update/migration;
- define production readiness and launch gates.

---

# 1. DOCUMENT CONTROL

## 1.1 Authoritative role

Part 3 is authoritative for:

- command semantics;
- command grammar;
- command compatibility aliases;
- TUI information architecture;
- keyboard interaction;
- multimodal user experience;
- approval UX;
- privacy UX;
- diagnostics;
- audit UX;
- export/import;
- backup/restore;
- evaluation;
- benchmark operations;
- performance targets;
- release process;
- packaging;
- upgrade/migration;
- production acceptance.

## 1.2 Cross-part dependency rule

Part 3 must reuse the object and state definitions from Parts 1 and 2.

Do not create conflicting definitions of:

```text
Project
Session
Task
Agent
Team
Workflow
ContentObject
Attachment
Artifact
MemoryItem
ContextPlan
Checkpoint
HarnessEvent
ToolDefinition
ModelAdapter
ProviderAdapter
Executor
```

---

# 2. PRODUCT USER EXPERIENCE PRINCIPLES

## UX-001 — Immediate visibility

The user must always be able to see:

- active project;
- active session;
- current working directory;
- active mode;
- model;
- provider;
- active agents;
- context usage;
- token usage;
- tool calls;
- current task state.

## UX-002 — No hidden destructive behavior

Destructive operations must be:

- explicit;
- inspectable;
- policy-controlled;
- auditable.

## UX-003 — State over chat

Important state should be visible as structured UI objects, not buried in conversational text.

## UX-004 — Progressive disclosure

Simple workflows remain simple.

Advanced functionality is available without forcing every user to manage it.

## UX-005 — Machine-readable first

Every important CLI operation must have a machine-readable equivalent.

---

# 3. INTERFACE CHANNELS

Anantham must support:

```text
CLI
TUI
Local HTTP API
WebSocket
SSE
JSON-RPC
SDK
Headless CI
Optional Web UI
Future remote/mobile UI
```

All interfaces operate against the same runtime state.

---

# 4. COMMAND RUNTIME

## 4.1 Command registry

Commands are registered using:

```ts
interface CommandDefinition {
  name: string;
  aliases: string[];

  description: string;

  arguments: CommandArgument[];
  options: CommandOption[];

  permissions: string[];

  execute(ctx: CommandContext): Promise<CommandResult>;
}
```

The UI must never hard-code business logic into slash-command handlers.

---

# 5. COMMAND GRAMMAR

Canonical format:

```text
/<namespace> <subcommand> [arguments] [options]
```

Examples:

```text
/projects add video-editor D:/Projects/video-editor
/projects search "video editor"
/api key enable key_123
/mcps inspect playwright
/review --scope src/
/orchestrate preview release-review
```

---

# 6. COMMAND HELP

Required:

```text
/help
/help projects
/help projects add
```

Help should display:

- description;
- arguments;
- options;
- aliases;
- permission requirements;
- examples;
- related commands.

---

# 7. COMMAND AUTOCOMPLETE

Autocomplete must understand:

- commands;
- subcommands;
- project names;
- session IDs;
- task IDs;
- agent IDs;
- model IDs;
- provider IDs;
- MCP names;
- plugin names;
- skill names;
- file paths.

---

# 8. COMPATIBILITY ALIAS LAYER

The system must map common external command names into canonical Anantham operations.

Examples:

```text
/continue -> /resume
/chat -> /resume
/sessions -> /resume
/summarize -> /compact
```

Compatibility aliases must not create separate implementations.

---

# 9. COMPLETE CORE COMMAND INVENTORY

```text
/help
/about
/init

/projects
/session
/resume
/tree
/fork
/clone
/checkpoint
/rewind
/rollback
/restore

/context
/compact
/autocompact

/memory
/search
/index

/attach

/model
/models
/provider
/api
/auth
/credentials
/profiles

/agents
/teams
/tasks
/orchestrate
/workflow
/commands
/hooks

/tools
/mcps
/plugins
/skills

/plan
/analyze
/review
/ultrareview

/permissions
/policy
/mode
/audit
/privacy

/directory
/shells
/worktrees

/artifacts
/stats
/history
/doctor
/evals
/bench
/replay

/settings
/theme
/notifications

/export
/import
/backup
/cleanup

/pr
/ci

/vim
/clear
/quit
```

---

# 10. PROJECT COMMANDS

```text
/projects
/projects add <name> <path>
/projects remove <name>
/projects use <name>
/projects search <query>
/projects filter <expr>
/projects recent
/projects info <name>
/projects archive <name>
/projects restore <name>
/projects prune
```

## Behavior

`/projects remove` defaults to unregistering the project.

It must NOT delete source files.

Potential destructive option:

```text
/projects delete <name> --source
```

requires elevated confirmation and policy.

---

# 11. PROJECT BROWSER

The project browser must display:

```text
NAME
STATUS
PATH
LAST ACTIVITY
SESSIONS
OPEN TASKS
AGENTS
TOKENS
COST
TAGS
```

Example:

```text
ANANTHAM PROJECTS

video-editor       ACTIVE     D:/Projects/video-editor
ecommerce-api      RECENT     D:/Projects/ecommerce-api
agent-lab          RECENT     D:/Projects/agent-lab
old-blog           ARCHIVED   D:/Projects/old-blog
```

---

# 12. PROJECT FILTER LANGUAGE

Support:

```text
active
recent
archived

tag:typescript
language:python
openTasks>0
sessions>10
cost>10
lastUsed<30d
```

Compound expressions:

```text
active AND tag:typescript
recent AND openTasks>0
```

---

# 13. PROJECT BOOTSTRAP UX

After adding a project, display:

```text
Project detected:
  TypeScript
  Next.js
  pnpm
  Git
  Vitest

Detected:
  install = pnpm install
  test    = pnpm test
  build   = pnpm build

Instructions found:
  AGENTS.md
  CLAUDE.md
```

User chooses whether to accept generated project profile.

---

# 14. SESSION COMMANDS

```text
/session
/session list
/session search <query>
/session rename <name>
/session fork
/session delete <id>

/resume
/resume last
/resume <session-id>
/resume project <name>
/resume checkpoint <id>

/tree
/tree checkout
/tree branch
/tree compare

/fork
/clone
```

---

# 15. RESUME UX

When `/resume` is invoked:

```text
PROJECT
SESSION
BRANCH
CHECKPOINT
LAST ACTIVITY
MODEL
MODE
PENDING TASK
PENDING APPROVALS
MEMORY
CONTEXT USAGE
```

Example:

```text
Resume session?

Project: video-editor
Session: subtitle-pipeline
Branch: main
Checkpoint: subtitle-v4
Last activity: 18 minutes ago
Model: openrouter/...
Pending task: Verify subtitle timing
Pending approvals: 0
Context: 43.2k / 128k

[resume] [inspect] [cancel]
```

---

# 16. RESUME VALIDATION

Before continuation:

```text
validate project path
validate Git state
validate checkpoint
validate workflow version
validate plugin versions
validate skill versions
validate MCP availability
validate model capability
validate permissions
validate required credentials
```

If any required dependency is unavailable, show a recovery plan.

---

# 17. CHECKPOINT COMMANDS

```text
/checkpoint
/checkpoint save <name>
/checkpoint list
/checkpoint inspect <name>
/checkpoint resume <name>
/checkpoint delete <name>
```

---

# 18. REWIND COMMANDS

```text
/rewind
/rewind conversation
/rewind files
/rewind both
```

The UI must preview consequences.

---

# 19. CONTEXT COMMANDS

```text
/context
/context detail
/context files
/context memory
/context tools
/context skills
/context attachments
/context artifacts
/context history
/context budget
/context provenance
/context export
/context simulate
```

---

# 20. CONTEXT UI

Example:

```text
CONTEXT

Window             128,000
Current input       74,200
Output reserve      12,000
Available           41,800
Autocompact        102,400

CRITICAL             4,000
HIGH                18,300
NORMAL              34,500
LOW                 17,400

Files               22
Memory               8
Skills               4
Tools               13
Attachments          3
Artifacts            5
```

---

# 21. CONTEXT PROVENANCE UX

For every item:

```text
SOURCE
REASON
PRIORITY
REPRESENTATION
TOKENS
```

Example:

```text
src/auth/session.ts
Reason: references AuthService used by changed login route
Priority: HIGH
Tokens: 1,824
```

---

# 22. COMPACTION COMMANDS

```text
/compact
/compact <instruction>
/compact preview
/compact aggressive
/compact conservative
/compact undo
/autocompact on
/autocompact off
/compact policy
```

---

# 23. COMPACTION PREVIEW UX

```text
CURRENT: 87,400 tokens
AFTER:   46,200 tokens

PRESERVED:
  CRITICAL 100%
  HIGH     100%

SUMMARIZED:
  NORMAL   28,400

DROPPED:
  LOW       9,700

ARTIFACT REFERENCES RETAINED: 17

[compact] [cancel]
```

---

# 24. COMPACTION FAILURE

If critical data cannot be preserved:

```text
COMPACTION BLOCKED

Reason:
  Pending approval state could not be represented safely.

No context changed.
```

The previous context remains active.

---

# 25. MEMORY COMMANDS

```text
/memory
/memory show
/memory project
/memory session
/memory agent
/memory global
/memory search <query>
/memory add
/memory forget <id>
/memory refresh
/memory export
/memory stats
```

---

# 26. MEMORY UI

```text
PROJECT MEMORY

ID       TYPE               CONFIDENCE  STATUS
mem-01   architecture       0.96       valid
mem-02   test-command       0.99       valid
mem-03   old-port            0.43       stale
```

---

# 27. ATTACHMENT COMMANDS

```text
/attach
/attach <path>
/attach list
/attach inspect <id>
/attach preview <id>
/attach extract <id>
/attach remove <id>
```

---

# 28. MULTIMODAL INPUT UX

Users may provide:

```text
image
PDF
document
spreadsheet
audio
video
archive
source code
JSON
CSV
URL
screenshot
clipboard content
```

Supported interaction styles:

```text
@file.png
@spec.pdf
@src/
paste image
drag/drop in supported UIs
```

---

# 29. MULTIMODAL PREVIEW

Before a large multimodal request:

```text
Attachments:
[x] UI.png         image       2.1 MB
[x] requirements.pdf  PDF      14 pages
[x] data.xlsx      spreadsheet  3 sheets
```

The system shows the model-compatible representations:

```text
UI.png -> image
requirements.pdf -> text + 4 page images
data.xlsx -> relevant sheet ranges
```

---

# 30. MULTIMODAL FAILURE UX

If selected model cannot consume a file:

```text
Model does not support native PDF input.

Anantham can:
[1] extract text
[2] render pages to images
[3] use another model
[4] cancel
```

---

# 31. MODEL COMMANDS

```text
/model
/model list
/model use <provider>/<model>
/model inspect <provider>/<model>
/model capabilities
/model profile list
/model profile use <name>
/model route explain
```

---

# 32. PROVIDER COMMANDS

```text
/provider
/provider list
/provider add
/provider remove
/provider inspect
/provider test
```

---

# 33. API COMMANDS

```text
/api
/api providers
/api add
/api remove
/api keys
/api key add
/api key remove
/api key enable
/api key disable
/api pool
/api concurrency
/api test
/api usage
/api limits
```

---

# 34. KEY POOL UI

```text
OPENROUTER KEY POOL

KEY           STATUS       ACTIVE   LIMIT
key-A         HEALTHY        2/5
key-B         HEALTHY        1/5
key-C         COOLDOWN       0/5     00:31
key-D         DISABLED       0/5
```

The raw credentials must never be displayed.

---

# 35. MODEL PROFILE UI

```text
PROFILE: maximum

Planner:
  openrouter/reasoning-x

Coder:
  direct/deepseek-coder

Reviewer:
  anthropic/reviewer

Vision:
  google/vision

Max agents:
  8

Max cost:
  $10/task
```

---

# 36. AGENT COMMANDS

```text
/agents
/agents list
/agents create
/agents inspect <id>
/agents start
/agents stop <id>
/agents pause <id>
/agents resume <id>
/agents steer <id>
/agents background
```

---

# 37. AGENT UI

Each active agent:

```text
Agent: coder-2
Role: implementer
Task: backend-auth
Model: openrouter/...
Key: pool-key-B
Status: RUNNING
Elapsed: 04:32
Tokens: 18.4k
Tool calls: 12
Worktree: wt-02
```

---

# 38. TASK COMMANDS

```text
/tasks
/tasks list
/tasks inspect <id>
/tasks cancel <id>
/tasks pause <id>
/tasks resume <id>
/tasks retry <id>
/tasks reassign <id>
```

---

# 39. TASK BOARD UI

```text
QUEUED
  T-11 Add tests

RUNNING
  T-07 Backend
  T-08 Frontend

REVIEW
  T-09 Security

BLOCKED
  T-10 Waiting for API key

DONE
  T-01 Architecture
```

---

# 40. TEAM COMMANDS

```text
/teams
/teams create
/teams list
/teams status
/teams tasks
/teams message
/teams stop
```

---

# 41. TEAM UI

```text
TEAM: release-review

Coordinator
  |
  +-- security     RUNNING
  +-- architecture RUNNING
  +-- tests         DONE
  +-- performance  QUEUED

Messages: 23
Artifacts: 9
Cost: $1.42
```

---

# 42. ORCHESTRATION COMMANDS

```text
/orchestrate
/orchestrate list
/orchestrate inspect <name>
/orchestrate run <name>
/orchestrate preview <name>
/orchestrate pause <id>
/orchestrate resume <id>
/orchestrate cancel <id>
/orchestrate history
```

---

# 43. WORKFLOW UI

Preview must display:

```text
Workflow: release-review
Version: 2.4.1

Tasks:
  1. tests
  2. security
  3. architecture
  4. synthesis

Agents: 4
Models: 3
Key pool: 4 keys / max 4 active
Estimated tokens: 180k
Estimated cost: $1.70
Permissions: WRITE + EXECUTE
Execution: local
```

---

# 44. TOOL COMMANDS

```text
/tools
/tools list
/tools search
/tools inspect
/tools schema
/tools enable
/tools disable
```

---

# 45. MCP COMMANDS

```text
/mcps
/mcps list
/mcps add
/mcps remove
/mcps enable
/mcps disable
/mcps restart
/mcps auth
/mcps tools
/mcps resources
/mcps prompts
/mcps schema
/mcps inspect
/mcps health
```

---

# 46. PLUGIN COMMANDS

```text
/plugins
/plugins list
/plugins add
/plugins remove
/plugins enable
/plugins disable
/plugins update
/plugins inspect
/plugins reload
/plugins doctor
```

---

# 47. SKILL COMMANDS

```text
/skills
/skills list
/skills install
/skills remove
/skills enable
/skills disable
/skills reload
/skills inspect
/skills test
```

---

# 48. HOOK COMMANDS

```text
/hooks
/hooks list
/hooks inspect
/hooks add
/hooks remove
/hooks enable
/hooks disable
/hooks test
```

---

# 49. PLAN MODE

```text
/plan
```

Default behavior:

- read-only;
- repository analysis;
- task decomposition;
- architecture identification;
- plan artifact generation.

No project mutation unless explicitly enabled through policy.

---

# 50. ANALYZE MODE

```text
/analyze
```

Produces:

- repository map;
- architecture;
- dependency graph;
- diagnostics;
- technical debt;
- likely failure areas;
- recommended priorities.

---

# 51. REVIEW

```text
/review
/review --scope src/
/review --git
/review --files
/review config
/review history
```

---

# 52. ULTRAREVIEW

```text
/ultrareview
/ultrareview --reviewers 5
/ultrareview --providers 3
/ultrareview --severity high
```

---

# 53. REVIEW RESULT

```text
BLOCKER
  Missing auth check
  src/api/users.ts:142

HIGH
  Unvalidated user input
  src/api/search.ts:63

MEDIUM
  Duplicate retry logic
```

Every result should include:

```text
severity
confidence
location
evidence
impact
recommendation
```

---

# 54. PERMISSION COMMANDS

```text
/permissions
/permissions inspect
/permissions allow
/permissions deny
/permissions ask
/policy
/policy explain
/policy simulate
```

---

# 55. MODE COMMANDS

```text
/mode normal
/mode plan
/mode analyze
/mode review
/mode ultrareview
/mode auto
/mode accept-edits
/mode allow-dangerous
/mode skip-permissions
/mode custom <name>
```

---

# 56. SECURITY WARNING UX

For dangerous mode:

```text
WARNING

Skip-permissions mode is enabled.

The normal approval layer is disabled.
Agents may execute configured high-risk operations
without interactive confirmation.

Type:
  ENABLE SKIP PERMISSIONS
```

---

# 57. DIRECTORY COMMANDS

```text
/directory
/directory show
/directory add <path>
/directory remove <path>
```

---

# 58. WORKTREE COMMANDS

```text
/worktrees
/worktrees list
/worktrees create
/worktrees inspect
/worktrees merge
/worktrees remove
```

---

# 59. SHELL COMMANDS

```text
/shells
/shells list
/shells start
/shells stop
/shells logs
/shells attach
/shells restart
```

---

# 60. ARTIFACT COMMANDS

```text
/artifacts
/artifacts list
/artifacts inspect
/artifacts preview
/artifacts open
/artifacts export
/artifacts delete
```

---

# 61. ARTIFACT UI

```text
TASK ARTIFACTS

[plan]                 VERIFIED
[changes.diff]         UNVERIFIED
[test-report]          VERIFIED
[screenshot]            VERIFIED
[security-review]      VERIFIED
[final-report]          VERIFIED
```

---

# 62. STATS COMMANDS

```text
/stats
/stats session
/stats model
/stats provider
/stats tools
/stats agents
/stats project
/stats keys
/stats context
/stats storage
```

---

# 63. REQUIRED STATISTICS

Display:

```text
model
provider
input tokens
output tokens
cached tokens where available
context usage
tool calls
tool failures
agent count
duration
cost
retries
compactions
verification runs
```

---

# 64. HISTORY

```text
/history
/history search
/history project
/history session
/history task
/history export
```

---

# 65. DOCTOR

`/doctor` must diagnose:

```text
runtime
Node
pnpm
Git
Docker
database
filesystem
workspace
provider
model
credentials
MCP
plugins
skills
LSP
browser
index
storage
permissions
```

Output:

```text
PASS
WARN
FAIL
```

---

# 66. DOCTOR EXAMPLE

```text
ANANTHAM DOCTOR

Runtime        PASS
SQLite         PASS
Git            PASS
Docker         PASS

OpenRouter     PASS
Key pool       WARN (1 key cooling)

Playwright MCP PASS
Neo4j MCP      FAIL (authentication)

TypeScript LSP PASS
Python LSP     WARN (not installed)

Project index  PASS
Memory index   PASS
```

---

# 67. SEARCH COMMAND

```text
/search <query>
```

Global search across:

```text
projects
sessions
tasks
memory
artifacts
files
symbols
events
workflows
```

---

# 68. INDEX COMMAND

```text
/index
/index status
/index rebuild
/index project
/index symbols
/index memory
/index artifacts
```

---

# 69. DIAGNOSTICS

```text
/diagnostics
/diagnostics files
/diagnostics project
/diagnostics agents
/diagnostics tools
```

---

# 70. AUDIT

```text
/audit
/audit search
/audit task <id>
/audit agent <id>
/audit provider <id>
/audit export
```

Audit entries include:

```text
who
what
when
where
why
policy
approval
result
```

---

# 71. PRIVACY

```text
/privacy
/privacy inspect
/privacy project
/privacy provider
/privacy retention
/privacy purge
```

Show:

```text
Data leaving machine
Provider
Model
MCP
Remote execution
Telemetry
Retention
```

---

# 72. BACKUP

```text
/backup
/backup create
/backup list
/backup inspect
/backup restore
```

---

# 73. BACKUP SCOPE

Backup can include:

```text
projects
sessions
events
checkpoints
memory
artifacts
attachments
workflows
configuration
plugin metadata
skill metadata
```

Credentials are excluded by default.

---

# 74. IMPORT / EXPORT

```text
/export session
/export project
/export memory
/export task
/export artifact

/import session
/import project
/import memory
```

Formats:

```text
JSON
JSONL
ZIP bundle
Markdown
```

---

# 75. MIGRATION

Potential commands:

```text
/migrate claude
/migrate gemini
/migrate opencode
/migrate cursor
```

Migration must report:

```text
Imported
Converted
Unsupported
Manual action required
```

---

# 76. COMPATIBILITY IMPORTS

Where technically feasible:

```text
CLAUDE.md
GEMINI.md
AGENTS.md
.cursor/rules/
MCP config
skills
commands
```

Imported instructions remain untrusted project configuration.

---

# 77. THEME COMMANDS

```text
/theme
/theme list
/theme set <name>
/theme install <source>
```

---

# 78. THEME FILE

Example:

```json
{
  "name": "midnight",
  "colors": {
    "background": "...",
    "foreground": "...",
    "warning": "...",
    "error": "...",
    "success": "...",
    "agent": "..."
  }
}
```

---

# 79. STATUS HEADER

The TUI must always show:

```text
ANANTHAM
Project: video-editor
Session: subtitle-pipeline
Mode: AUTO
Model: openrouter/...
Agents: 4 running / 8 max
MCP: 4 connected
Tools: 18 enabled
Context: 41.2k / 128k
Tokens: 183.4k
Tool calls: 92
Cost: $0.84
WD: D:/Projects/video-editor
```

---

# 80. TUI INFORMATION ARCHITECTURE

```text
+----------------------------------------------------------------+
| ANANTHAM | PROJECT | SESSION | MODE | MODEL | CONTEXT          |
+----------------------------+-----------------------------------+
| Conversation               | Agents                            |
|                            |                                   |
| user                       | planner       RUNNING             |
| agent                      | implementer   RUNNING             |
| tool                       | reviewer      WAITING             |
|                            | verifier      QUEUED              |
+----------------------------+-----------------------------------+
| Tasks | Memory | Context | MCP | Tools | Artifacts | Approvals |
+----------------------------------------------------------------+
| > command / prompt                                          |
+----------------------------------------------------------------+
```

---

# 81. TUI PANELS

Required panels:

```text
Conversation
Projects
Sessions
Tasks
Agents
Teams
Context
Memory
Tools
MCP
Plugins
Skills
Artifacts
Approvals
Stats
Audit
```

---

# 82. TUI KEYBOARD SHORTCUTS

Minimum:

```text
Ctrl+C  interrupt current action
Ctrl+P  command/search palette
Ctrl+O  projects
Ctrl+S  sessions
Ctrl+A  agents
Ctrl+M  memory
Ctrl+T  tools
Ctrl+R  review
Ctrl+Shift+R ultra review
Ctrl+L  context
Ctrl+K  commands
```

Exact keys may vary by platform, but shortcuts must be configurable.

---

# 83. INPUT MODES

Support:

```text
prompt
command
multiline
vim
paste
file reference
attachment
```

---

# 84. VIM MODE

```text
/vim
```

must switch prompt editing behavior without changing runtime semantics.

---

# 85. TUI EVENT FILTERS

User can filter:

```text
all
model
tools
agents
errors
verification
approvals
MCP
```

---

# 86. TUI EVENT VIRTUALIZATION

Large histories must not render every event simultaneously.

Use virtualization/pagination.

---

# 87. TUI RESIZE

Panels must adapt to terminal width.

Critical information remains visible at narrow widths.

---

# 88. ACCESSIBILITY

Support:

- keyboard-only operation;
- high contrast;
- reduced motion;
- screen-reader friendly text modes where feasible;
- no color-only status indicators.

---

# 89. WEB/REMOTE UI

Optional web UI must use the same local API and events.

It must not create a second runtime.

---

# 90. HEADLESS EXECUTION

Example:

```bash
anantham run \
  --project ./repo \
  --workflow feature-development \
  --headless \
  --json-events
```

Required flags:

```text
--project
--session
--workflow
--model
--profile
--headless
--json
--jsonl
--no-color
--max-cost
--max-tokens
--max-time
```

---

# 91. EXIT CODES

```text
0 success
1 task failure
2 verification failure
3 policy denial
4 approval required
5 resource exhausted
6 configuration error
7 provider error
8 runtime error
9 migration/restore failure
10 security block
```

---

# 92. JSON OUTPUT

Example:

```json
{
  "status": "completed",
  "taskId": "task_123",
  "projectId": "proj_01",
  "verification": {
    "status": "passed"
  },
  "artifacts": [
    "artifact_1"
  ],
  "usage": {
    "inputTokens": 42100,
    "outputTokens": 8300
  }
}
```

---

# 93. API AUTHENTICATION

Local API:

- local socket preferred;
- loopback-only default;
- random local auth token if HTTP;
- remote access explicitly disabled by default.

Remote mode requires explicit authentication configuration.

---

# 94. WEBHOOK SECURITY

Use:

```text
HMAC signatures
timestamp
nonce
replay protection
optional IP allowlist
```

---

# 95. CREDENTIAL MANAGEMENT

Never expose raw credentials through:

```text
TUI
logs
artifacts
event payloads
telemetry
model context
```

---

# 96. SECRET REDACTION

Redaction pipeline:

```text
tool output
 |
secret detector
 |
redactor
 |
model-visible output
```

Raw logs remain restricted.

---

# 97. DATA CLASSIFICATION

Each content object may be classified:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
SECRET
```

---

# 98. DATA-POLICY ROUTING

Example:

```text
SECRET
 -> local model only

CONFIDENTIAL
 -> approved providers

INTERNAL
 -> configured provider set

PUBLIC
 -> normal routing
```

---

# 99. PRIVACY POLICY UI

Before sensitive remote request:

```text
DATA TRANSFER

Provider: OpenRouter
Model: model-x
Execution: remote
Included:
  4 source files
  1 PDF
  2 memory items

Policy:
  CONFIDENTIAL -> APPROVED

[send] [cancel]
```

---

# 100. AUDIT RETENTION

Users configure:

```text
audit retention
session retention
artifact retention
attachment retention
```

Legal/compliance extensions may enforce minimum retention.

---

# 101. DATA PURGE

Purge must account for:

```text
source content
derived representations
embeddings
cache
indexes
artifacts
memory
```

Deletion confirmation must show scope.

---

# 102. ENCRYPTION

Optional encryption-at-rest for:

- sensitive memory;
- sensitive artifacts;
- application database where supported;
- credential metadata.

OS credential stores remain preferred for secrets.

---

# 103. BACKUP ENCRYPTION

Encrypted backup should support:

```text
passphrase
key file
OS-managed key
```

Never log backup encryption keys.

---

# 104. ZERO-DATA-LOSS OPERATIONS

Critical operations:

```text
task state
session events
checkpoint
artifact
memory
workflow state
```

must use durable transactional writes.

---

# 105. CRASH RECOVERY UI

On startup:

```text
RECOVERY

3 interrupted tasks detected.

T-102  backend auth     resumable
T-103  review           waiting approval
T-104  browser test     environment lost

[recover all] [inspect]
```

---

# 106. RECOVERY OPTIONS

For each interrupted task:

```text
resume
resume from checkpoint
restart
requeue
abandon
export state
```

---

# 107. ORPHAN CLEANUP UI

```text
ORPHANS FOUND

2 temporary containers
1 worktree
3 extracted files

Referenced:
  1

Unreferenced:
  5

[cleanup safe] [inspect]
```

Never silently delete.

---

# 108. BACKUP VALIDATION

A backup must be validated by:

- archive integrity;
- manifest;
- hashes;
- schema versions;
- object counts.

---

# 109. RESTORE DRY RUN

Before restore:

```text
/projects restore --dry-run backup.zip
```

Show:

```text
projects: 3
sessions: 84
memory: 2,143
artifacts: 612
conflicts: 2
```

---

# 110. DATABASE INTEGRITY

`/doctor` and maintenance must support:

```text
PRAGMA integrity_check
```

plus Anantham event/checkpoint consistency checks.

---

# 111. EVENT REPLAY

`/replay` supports:

```text
/replay task <id>
/replay session <id>
/replay request <id>
```

---

# 112. REPLAY SAFETY

Default replay is simulation.

It does not re-run side effects unless explicitly requested and policy allows it.

---

# 113. MODEL REQUEST REPLAY

Safe model replay can use stored normalized:

```text
prompt/context
tool schemas
attachments
parameters
```

Secrets are redacted.

---

# 114. TOOL REPLAY

Tool replay defaults to:

```text
mock/simulated response
```

Live side effects require explicit confirmation.

---

# 115. EVALUATION COMMANDS

```text
/evals
/evals list
/evals run
/evals inspect
/evals compare
/evals report
```

---

# 116. BENCHMARK COMMANDS

```text
/bench
/bench list
/bench run
/bench compare
/bench report
```

---

# 117. EVALUATION DATA MODEL

A benchmark case contains:

```json
{
  "id": "bugfix-001",
  "repository": "...",
  "baseCommit": "...",
  "prompt": "...",
  "expected": {
    "testsPass": true
  },
  "limits": {
    "maxTokens": 100000,
    "maxCostUsd": 2
  }
}
```

---

# 118. EVALUATION METRICS

Measure:

```text
task success
verification success
false completion
repair count
tool error rate
context efficiency
token efficiency
cost
latency
safety blocks
resume correctness
multimodal correctness
parallel speedup
review quality
```

---

# 119. FALSE COMPLETION METRIC

A task is falsely completed when:

```text
model says complete
AND
acceptance criteria are not satisfied
```

This must be a primary reliability metric.

---

# 120. RESUME RELIABILITY METRIC

Run:

```text
execute
checkpoint
kill process
restart
resume
verify
```

Measure:

```text
resume success
state divergence
lost context
lost artifacts
duplicate side effects
```

---

# 121. COMPACTION QUALITY METRIC

Compare:

```text
no compact control
vs
compacted run
```

Measure:

```text
task success
critical fact retention
tool errors
repair iterations
token savings
```

---

# 122. MULTIMODAL BENCHMARK

Test:

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

Measure:

```text
correct extraction
correct representation
context selection
model compatibility
task outcome
```

---

# 123. API KEY POOL BENCHMARK

Test:

```text
1 key
3 keys
5 keys
10 keys
```

with:

```text
429
timeout
5xx
slow key
```

Measure:

```text
throughput
fairness
recovery
duplicate requests
```

---

# 124. PARALLEL AGENT BENCHMARK

Compare:

```text
1 agent
2 agents
4 agents
8 agents
```

Measure:

```text
speedup
conflict rate
cost
duplicate work
success
```

---

# 125. REVIEW BENCHMARK

Compare:

```text
single review
3-agent review
5-agent review
cross-provider review
```

Measure:

```text
true finding rate
false positive rate
duplicate findings
cost
latency
```

---

# 126. SECURITY BENCHMARK

Adversarial cases:

```text
prompt injection
command injection
path traversal
secret extraction
malicious MCP
malicious plugin
dangerous tool
```

Measure:

```text
block rate
false allow rate
false deny rate
```

---

# 127. PERFORMANCE TARGETS

These are engineering targets, not guarantees.

## Local startup

Target:

```text
cold start <= 2 seconds
```

excluding optional model discovery/network checks.

## Command latency

Basic local commands:

```text
p95 <= 150 ms
```

when no expensive work is required.

## Event persistence

Single event commit:

```text
p95 <= 50 ms
```

on supported local storage.

## Project switch

Cached project:

```text
p95 <= 500 ms
```

excluding large index operations.

---

# 128. INDEXING PERFORMANCE

Incremental file update should target:

```text
p95 <= 250 ms
```

for ordinary source-file changes, excluding heavy extraction.

---

# 129. CONTEXT BUILD PERFORMANCE

Target:

```text
p95 <= 500 ms
```

for cached local context.

Large multimodal retrieval may exceed this.

---

# 130. TUI PERFORMANCE

Target:

```text
60 FPS where terminal/rendering stack permits
```

with large event histories.

---

# 131. PARALLEL SCHEDULER PERFORMANCE

Scheduler operations should not become a material bottleneck under:

```text
100 active tasks
1000 queued tasks
100 concurrent tool/model operations
```

for local development environments.

---

# 132. STORAGE SCALABILITY TARGET

Initial local design should support:

```text
10,000 projects
100,000 sessions
1,000,000 tasks/events
```

subject to disk capacity and indexing strategy.

---

# 133. LOGGING REQUIREMENTS

Logs must be:

```text
structured
timestamped
correlated
redactable
rotatable
```

---

# 134. LOG LEVELS

```text
silent
error
warn
info
debug
trace
```

---

# 135. CORRELATION IDS

Every operation should be traceable through:

```text
requestId
projectId
sessionId
taskId
agentId
toolCallId
artifactId
providerRequestId
```

---

# 136. OPEN TELEMETRY

Support spans for:

```text
task
agent
model
tool
MCP
context
memory
attachment
verification
executor
```

---

# 137. TELEMETRY PRIVACY

Telemetry must support:

```text
off
metadata-only
redacted
full
```

per policy.

---

# 138. SECURITY THREAT MODEL

Threat classes:

```text
prompt injection
malicious repository
malicious web page
malicious MCP
malicious plugin
malicious skill
command injection
path traversal
secret exfiltration
network abuse
sandbox escape
resource exhaustion
API-key abuse
supply-chain compromise
```

---

# 139. SECURITY BOUNDARY

```text
untrusted content
      |
classification
      |
provenance
      |
context
```

Untrusted content cannot become system policy.

---

# 140. INSTRUCTION HIERARCHY

A formal authority model must be implemented.

Example:

```text
system security
>
runtime policy
>
user
>
project instruction
>
skill
>
agent plan
>
tool output
>
repository content
>
web content
```

The exact implementation should be documented in an ADR and covered by tests.

---

# 141. SECURITY POLICY

No model, skill, plugin, workflow or MCP may:

- self-grant permissions;
- disable auditing;
- remove its own limits;
- expose raw credentials;
- bypass sandbox;
- mark a task verified without verifier evidence.

---

# 142. DANGEROUS MODE AUDIT

Enabling:

```text
allow-dangerous
skip-permissions
```

must create:

```text
mode.changed
```

audit event.

---

# 143. TOOL RISK

Every tool declares risk.

```text
READ
WRITE
EXECUTE
NETWORK
GIT
DEPLOY
SECRETS
```

---

# 144. DATA + ACTION RISK

Risk should be computed from:

```text
data sensitivity
+
tool risk
+
execution target
+
provider trust
```

---

# 145. HIGH-RISK ACTION UI

```text
HIGH RISK ACTION

Agent: release
Tool: git.push
Target: origin/main
Impact: external repository mutation

Policy: ASK

[approve once]
[approve task]
[deny]
```

---

# 146. APPROVAL QUEUE

Approvals must be durable.

Fields:

```text
approvalId
taskId
agentId
tool
arguments
risk
policyVersion
expiresAt
status
```

---

# 147. APPROVAL EXPIRY

Expired approvals cannot authorize new operations.

---

# 148. BATCH APPROVAL

Users can approve:

```text
all read-only file reads
```

but high-risk operations remain individually controlled unless policy explicitly permits batching.

---

# 149. POLICY EXPLANATION

Example:

```text
/policy explain git.push

Decision: ASK

Why:
  Tool risk = GIT
  Target = remote repository
  Project policy = developer
  User approval required
```

---

# 150. POLICY SIMULATION

```text
/policy simulate shell.execute "npm install"
```

must never execute the command.

---

# 151. POLICY REVISION

Policies have versions.

A new policy can invalidate old approvals where necessary.

---

# 152. SUPPLY-CHAIN SECURITY

Release pipeline should perform:

```text
dependency audit
license scan
SBOM
lockfile verification
plugin verification
```

---

# 153. PLUGIN SECURITY

Before install:

```text
source
publisher
checksum
permissions
dependencies
network
filesystem
credentials
```

are displayed.

---

# 154. SKILL SECURITY

Skills must not be treated as trusted policy.

They are executable procedural context with declared dependencies.

---

# 155. MCP SECURITY

MCP server outputs are untrusted data.

Servers require explicit trust/configuration.

---

# 156. BROWSER SECURITY

Browser execution uses isolated profiles where appropriate.

Personal browser credentials must not be silently imported.

---

# 157. REMOTE EXECUTION SECURITY

Remote target must declare:

```text
host
image
network
credentials
filesystem
```

---

# 158. WORKSPACE SECURITY

Allowed roots are explicit.

Path canonicalization is mandatory.

---

# 159. NETWORK POLICY

Supported:

```text
none
allowlist
restricted
full
```

Default depends on execution/trust profile.

---

# 160. FILESYSTEM POLICY

Default-deny sensitive locations:

```text
.ssh
.aws
.env
*.pem
*.key
credentials
```

unless explicitly authorized.

---

# 161. SECRET SCANNING

Scan:

- tool outputs;
- artifacts;
- logs;
- context;
- model requests;
- workflow outputs.

---

# 162. DLP RESPONSE

On detected secret:

```text
redact
block
notify
audit
```

policy-dependent.

---

# 163. INSTALLATION

Supported environments should include:

```text
Windows
macOS
Linux
```

---

# 164. INSTALLER REQUIREMENTS

Installer configures:

```text
runtime
CLI
database
default directories
credentials integration
optional Docker
optional browser dependencies
```

---

# 165. FIRST-RUN WIZARD

First launch should guide:

```text
1. storage location
2. default provider
3. API key
4. model
5. workspace
6. privacy
7. theme
8. concurrency
```

Advanced configuration remains optional.

---

# 166. `anantham doctor`

First-run validation should be equivalent to:

```text
/doctor
```

---

# 167. UPDATES

Update process:

```text
backup
 |
install
 |
migrate
 |
validate
 |
health-check
 |
rollback if failed
```

---

# 168. DATABASE MIGRATION

Migrations must:

- be numbered;
- be transactional where possible;
- create a backup checkpoint;
- validate post-migration integrity.

---

# 169. ROLLBACK

Application binary rollback must not automatically roll back user source-code changes.

Database migrations require their own compatibility plan.

---

# 170. PLUGIN UPDATE

Before plugin update:

```text
current version checkpoint
contract tests
compatibility
upgrade
health
rollback
```

---

# 171. SKILL UPDATE

Tasks retain the version pinned at task creation.

New tasks use the current enabled version.

---

# 172. WORKFLOW UPDATE

Active workflow runs retain their workflow version.

New runs use the newest version.

---

# 173. MODEL UPDATE

Model profile changes do not silently mutate active tasks.

---

# 174. CONFIG MIGRATION

Configuration schemas must have migration handlers.

---

# 175. BACKWARD COMPATIBILITY

The system should strive to preserve:

```text
session resume
task state
memory
workflow state
artifact access
```

across minor releases.

---

# 176. RELEASE CHANNELS

Potential:

```text
stable
beta
nightly
```

---

# 177. FEATURE FLAGS

Use flags for:

```text
agent teams
remote agents
computer use
dynamic tools
new retrieval
new compaction
```

---

# 178. STABILITY STATES

Every experimental capability should show:

```text
STABLE
BETA
EXPERIMENTAL
DISABLED
```

---

# 179. DOCUMENTATION REQUIREMENTS

Repository must contain:

```text
README.md
CONTRIBUTING.md
SECURITY.md
LICENSE
CHANGELOG.md

docs/
  product/
  architecture/
  commands/
  security/
  api/
  workflows/
  plugins/
  skills/
  mcp/
  operations/
```

---

# 180. GENERATED DOCUMENTATION

Generate from schemas:

```text
command reference
tool reference
API reference
plugin schema
workflow DSL
configuration
```

---

# 181. ADR PROCESS

Every significant architecture decision has:

```text
ID
Context
Decision
Alternatives
Consequences
Migration impact
```

---

# 182. SOURCE ATTRIBUTION

When external implementations are reused, preserve required notices and maintain:

```text
THIRD_PARTY_NOTICES.md
```

---

# 183. CONTRIBUTOR DEVELOPMENT

Required scripts:

```text
pnpm install
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:integration
pnpm test:security
pnpm test:e2e
pnpm bench
```

---

# 184. CI GATES

Pull requests should require:

```text
typecheck
lint
unit
integration
security
build
```

before merge where feasible.

---

# 185. TEST PYRAMID

```text
unit
contract
integration
security
replay
e2e
agent evaluation
performance
```

---

# 186. PROPERTY TESTING

Use property/fuzz tests for:

```text
command parser
tool schemas
policy engine
workflow graph
event reducer
attachment parser
```

---

# 187. DISASTER RECOVERY TEST

Regularly simulate:

```text
process kill
power-loss simulation
database interruption
disk-full
artifact interruption
network drop
provider outage
```

---

# 188. DISK-FULL BEHAVIOR

Anantham must:

```text
detect storage failure
stop unsafe writes
preserve available state
surface error
avoid corrupting database
```

---

# 189. RESOURCE EXHAUSTION

If memory/CPU/disk is exhausted:

```text
pause
checkpoint
release expendable resources
notify
```

---

# 190. MODEL OUTAGE

If all configured models are unavailable:

```text
tasks wait
state persists
user notified
resume when provider available
```

---

# 191. PROVIDER OUTAGE DASHBOARD

Show:

```text
provider
model
health
last error
cooldown
fallback
```

---

# 192. NETWORK OUTAGE

Local tasks continue if they do not require remote capabilities.

---

# 193. MCP OUTAGE

Only tasks requiring that MCP should block.

Unrelated tasks continue.

---

# 194. PLUGIN OUTAGE

Only dependent capabilities should fail.

Core runtime remains alive.

---

# 195. SKILL FAILURE

Agent should receive structured skill failure and recovery options.

---

# 196. INDEX FAILURE

Code index failure should degrade to lexical/file search rather than block all coding workflows.

---

# 197. MEMORY INDEX FAILURE

Memory retrieval may degrade to direct project/session queries.

---

# 198. BROWSER FAILURE

Non-browser tasks continue.

---

# 199. DOCKER FAILURE

Policy decides whether restricted-local fallback is permitted.

---

# 200. REMOTE HOST FAILURE

Remote tasks become:

```text
WAITING_RESOURCE
```

unless recovery target is available.

---

# 201. NOTIFICATION SYSTEM

Notifications can be delivered to:

```text
TUI
desktop
web
webhook
Slack
Discord
email
```

---

# 202. NOTIFICATION EVENTS

Notify on:

```text
task completed
task failed
approval needed
background agent done
budget threshold
provider outage
key cooldown
verification failure
```

---

# 203. NOTIFICATION DEDUPLICATION

Use event fingerprints and cooldowns to prevent notification spam.

---

# 204. BACKGROUND AGENT USER EXPERIENCE

When user starts:

```text
/agents start ...
```

show:

```text
Agent detached successfully.

Task: T-123
Project: video-editor
Status: RUNNING
Budget: $2.00
Notify on: completion + failure
```

---

# 205. BACKGROUND AGENT FOLLOW-UP

User can later:

```text
/agents steer <id> "Focus on mobile layout"
/agents resume <id>
```

without creating a new session.

---

# 206. BACKGROUND AGENT HANDOFF

A user may take over:

```text
/agents attach <id>
```

and continue interactively.

---

# 207. TASK REPORT

Completed task should optionally produce:

```text
summary
plan
changes
tests
review
artifacts
cost
models
agents
```

---

# 208. SHAREABLE REPORT

Export:

```text
task-report.md
task-report.json
```

containing no raw credentials.

---

# 209. PORTABLE TASK BUNDLE

Create:

```text
anantham-task-<id>.zip
```

containing:

```text
manifest
events
artifacts
context snapshot
memory references
workflow version
```

according to privacy settings.

---

# 210. PORTABLE REPLAY

A task bundle can be loaded into an isolated evaluation environment.

---

# 211. MODEL REQUEST PRIVACY

Exact prompts/context snapshots should only be retained according to configured privacy.

---

# 212. REDACTED REPLAY

Where privacy prevents exact context storage, replay uses:

```text
structure
metadata
redacted placeholders
artifacts
```

---

# 213. PERFORMANCE MONITORING

The runtime should continuously monitor:

```text
event persistence
context build
retrieval
model latency
tool latency
MCP latency
executor latency
TUI rendering
```

---

# 214. PERFORMANCE WARNINGS

If a subsystem crosses configured thresholds:

```text
/context
/doctor
```

should report the bottleneck.

---

# 215. USER PERFORMANCE PROFILE

Settings:

```text
performance balanced
performance low-memory
performance maximum
```

---

# 216. LOW-MEMORY MODE

Reduce:

- concurrent agents;
- context cache;
- indexing parallelism;
- artifact previews.

Do not compromise durable state.

---

# 217. MAXIMUM PERFORMANCE MODE

May increase:

- worker count;
- index parallelism;
- cache;
- prefetching.

Still obeys budget/security.

---

# 218. SEARCH QUALITY

Evaluation should test:

```text
exact file retrieval
symbol retrieval
semantic retrieval
memory retrieval
session retrieval
```

---

# 219. RETRIEVAL FAILURE UI

Example:

```text
Context confidence LOW

The requested symbol was not found.
The runtime used:
  lexical search
  dependency graph
  session memory

Suggested:
  /index rebuild
  /context simulate
```

---

# 220. PROJECT MAP UI

Display:

```text
ENTRYPOINTS
MODULES
DEPENDENCIES
TESTS
SERVICES
LANGUAGES
```

---

# 221. CODE INTELLIGENCE UI

For symbol:

```text
AuthService

Definitions: 1
References: 23
Implementations: 3
Diagnostics: 2
Dependents: 7
```

---

# 222. LSP FAILURE UX

```text
TypeScript language server unavailable.

Falling back to:
  AST symbol index
  lexical search

[install LSP] [continue]
```

---

# 223. VISUAL DEBUGGING UX

Workflow:

```text
/screenshot
 |
vision analysis
 |
edit
 |
run browser
 |
screenshot
 |
visual diff
```

---

# 224. VISUAL DIFF ARTIFACT

```text
BEFORE
AFTER
DIFF
```

with metadata:

```text
viewport
URL
timestamp
commit
agent
```

---

# 225. BROWSER TRACE ARTIFACT

Capture:

```text
screenshots
DOM
console
network
interactions
timings
```

---

# 226. RESEARCH ARTIFACT

Research workflows should produce:

```text
question
claims
sources
timestamps
confidence
summary
```

---

# 227. SOURCE PROVENANCE

For research evidence:

```text
source URL
retrieval date
source title
claim mapping
```

---

# 228. DOCUMENT REVIEW ARTIFACT

For PDFs/documents:

```text
document
selected pages
annotations
findings
evidence
```

---

# 229. MULTIMODAL ARTIFACT

A multimodal task can generate:

```text
image
transcript
frame set
document extraction
visual diff
```

all linked to the same task.

---

# 230. CONTENT CACHE MANAGEMENT

Commands:

```text
/cache
/cache stats
/cache clear
/cache inspect
```

---

# 231. CACHE SAFETY

Cache may be deleted because it is derived.

It must never be treated as authoritative task state.

---

# 232. INDEX REBUILD

`/index rebuild` must be safe against data loss because index data is derived.

---

# 233. REPAIRABLE DATABASE

If derived projections are inconsistent:

```text
rebuild projection
```

from events.

---

# 234. PROJECTION MONITOR

`/doctor` should show:

```text
event log: PASS
project projection: PASS
stats projection: WARN
memory index: PASS
code index: PASS
```

---

# 235. ADMIN MAINTENANCE MODE

Advanced commands may include:

```text
/admin inspect
/admin repair
/admin rebuild
```

These should be restricted to expert/developer use.

---

# 236. MAINTENANCE LOCK

During database migration/repair:

```text
runtime = maintenance
```

to prevent concurrent mutation.

---

# 237. SAFE SHUTDOWN

On:

```text
/quit
```

Anantham should:

- stop admitting new tasks;
- checkpoint active tasks;
- persist events;
- terminate or detach child processes according to policy;
- close database cleanly.

---

# 238. FORCE SHUTDOWN

If forced termination occurs, startup recovery handles incomplete operations.

---

# 239. SIGNAL HANDLING

Handle:

```text
SIGINT
SIGTERM
```

and equivalent platform signals.

---

# 240. PROCESS LOCK

Only one writer runtime should own a project database unless a supported coordination layer is enabled.

---

# 241. MULTI-INSTANCE

If multiple Anantham processes access the same state:

- use locking;
- reject unsafe concurrent writers;
- or use a supported server mode.

---

# 242. LOCAL SOCKET

Preferred local API transport where platform supports it.

---

# 243. SERVER MODE

Optional:

```bash
anantham server
```

provides:

```text
local API
event stream
task manager
```

---

# 244. CLIENT MODE

```bash
anantham attach
```

connects a CLI/TUI to running server.

---

# 245. DETACHED SERVER

Server can continue background tasks while no UI is attached.

---

# 246. SERVER SHUTDOWN

Gracefully stops admission, checkpoints tasks, then exits.

---

# 247. REMOTE CONTROL SECURITY

Remote UI cannot be enabled without explicit auth configuration.

---

# 248. PRODUCT TELEMETRY

Telemetry is opt-in or policy-defined.

Local-only mode disables external telemetry.

---

# 249. CRASH REPORTING

Crash reports must:

- redact secrets;
- respect privacy;
- expose opt-in settings;
- contain correlation IDs.

---

# 250. SUPPORT BUNDLE

`/doctor export` can create:

```text
diagnostics
version
platform
configuration metadata
provider health
MCP health
plugin health
database schema
```

No raw secrets.

---

# 251. RELEASE ARTIFACTS

Release should produce:

```text
CLI package
TUI package
optional server
checksums
SBOM
source archive
```

---

# 252. PLATFORM PACKAGES

Potential:

```text
Windows installer
macOS package
Linux package
npm/pnpm package
container image
```

---

# 253. BUILD REPRODUCIBILITY

Record:

```text
runtime
compiler
dependency lockfile
build commit
build timestamp
```

---

# 254. SECURITY RELEASE GATE

No release if:

```text
critical vulnerability open
security suite failing
secret scanning failing
license compliance failing
```

---

# 255. DATA RELEASE GATE

No release if migration tests demonstrate:

```text
session loss
checkpoint loss
memory loss
artifact corruption
event loss
```

---

# 256. MULTIMODAL RELEASE GATE

No release claiming multimodal support if required modality tests fail.

---

# 257. PROVIDER RELEASE GATE

No provider adapter marked stable unless:

```text
auth
generation
streaming
tool calling
error handling
usage
retry
```

tests pass.

---

# 258. MCP RELEASE GATE

No MCP integration marked stable unless:

```text
connect
discover
execute
failure
auth
disable
restart
```

tests pass.

---

# 259. PARALLEL AGENT RELEASE GATE

Must demonstrate:

```text
parallel execution
resource limits
conflict protection
recovery
team coordination
```

---

# 260. ORCHESTRATION RELEASE GATE

Must demonstrate:

```text
DAG
parallel
condition
budget
checkpoint
resume
versioning
```

---

# 261. REVIEW RELEASE GATE

Must demonstrate:

```text
single review
parallel review
cross-model review
synthesis
repair
verification
```

---

# 262. SECURITY ACCEPTANCE SUITE

Minimum:

```text
100 prompt-injection cases
100 tool-policy cases
100 path traversal cases
100 secret-leak cases
100 MCP malicious-output cases
```

Targets are test-suite sizes, not claims that all real-world attacks are exhausted.

---

# 263. MULTIMODAL ACCEPTANCE SUITE

Minimum fixtures:

```text
20 images
10 PDFs
10 DOCX
10 XLSX
10 CSV
10 audio
10 video
5 archives
5 unknown binary files
```

---

# 264. RESUME ACCEPTANCE SUITE

Run tasks with interruption at:

```text
before model
after model
before tool
after tool
before checkpoint
after checkpoint
during verification
during compaction
```

---

# 265. ZERO-LOSS ACCEPTANCE SUITE

Simulate:

```text
SIGKILL
process crash
DB interruption
disk-full mock
network interruption
provider outage
MCP outage
Docker interruption
```

Verify authoritative data remains recoverable.

---

# 266. DATA-DURABILITY SLO

Target:

```text
RPO for committed Anantham state = 0
```

under supported local durability conditions.

This means no committed event should be intentionally discarded after recoverable application failure.

---

# 267. RECOVERY SLO

Target:

```text
RTO for local runtime recovery <= 30 seconds
```

for ordinary project sizes, excluding full index rebuilds.

---

# 268. RESUME SUCCESS TARGET

Target benchmark:

```text
>= 99% successful resume
```

for tested recoverable task scenarios.

---

# 269. FALSE COMPLETION TARGET

Target:

```text
< 1% false completion
```

on the production benchmark suite.

This must be measured rather than assumed.

---

# 270. TOOL SAFETY TARGET

Target:

```text
0 unauthorized high-risk tool executions
```

in the security acceptance suite.

---

# 271. DATA EXFILTRATION TARGET

Target:

```text
0 successful secret exfiltration
```

under defined adversarial tests.

---

# 272. PARALLEL CONFLICT TARGET

Target:

```text
0 silent file corruption
```

in supported Git-worktree parallel benchmarks.

---

# 273. PROVIDER FAILOVER TARGET

Target:

```text
>= 95% recovery from tested retry-safe provider failures
```

where a configured fallback exists.

---

# 274. MULTIMODAL TARGET

Target:

```text
>= 95% correct representation selection
```

on the supported multimodal fixture suite.

---

# 275. RETRIEVAL TARGET

Target:

```text
>= 90% top-k retrieval relevance
```

on curated code/context benchmarks.

The exact metric and benchmark set must be documented.

---

# 276. COST EFFICIENCY

Track:

```text
cost per successful task
tokens per successful task
tool calls per successful task
```

The objective is to improve reliability without uncontrolled cost growth.

---

# 277. PRODUCT QUALITY GATES

Before stable release:

```text
P0 requirements implemented
P0 acceptance tests pass
security tests pass
migration tests pass
resume tests pass
multimodal tests pass
parallel tests pass
provider tests pass
MCP tests pass
```

---

# 278. BETA RELEASE GATE

Beta may contain:

```text
known P1 gaps
experimental remote execution
experimental teams
experimental dynamic tools
```

but P0 reliability/security requirements cannot be waived.

---

# 279. STABLE RELEASE GATE

Stable means:

```text
no known critical data-loss defect
no known critical security bypass
validated resume
validated verification
validated plugin/MCP lifecycle
validated provider failure behavior
```

---

# 280. PRODUCTION RUNBOOK

Operations documentation must cover:

```text
startup
shutdown
backup
restore
migration
recovery
provider outage
MCP outage
storage failure
plugin failure
database repair
```

---

# 281. USER RUNBOOK

User documentation must cover:

```text
add project
start task
resume
memory
compact
attach files
use MCP
add API keys
run parallel agents
review
orchestrate
backup
restore
```

---

# 282. DEVELOPER RUNBOOK

Developer documentation:

```text
architecture
module boundaries
testing
plugin authoring
skill authoring
MCP integration
provider implementation
workflow DSL
security
release
```

---

# 283. INCIDENT RESPONSE

Security incidents require:

```text
detect
contain
disable capability
preserve evidence
notify
patch
rotate credentials
verify recovery
```

---

# 284. CREDENTIAL COMPROMISE RESPONSE

If provider key is compromised:

```text
disable key
remove from pool
rotate externally
update auth profile
invalidate sessions where necessary
audit usage
```

---

# 285. MALICIOUS PLUGIN RESPONSE

```text
disable plugin
quarantine
preserve manifest/checksum
identify affected tasks
review credentials
revoke capability
```

---

# 286. MALICIOUS MCP RESPONSE

Same pattern:

```text
disconnect
disable
preserve logs
rotate credentials
review task history
```

---

# 287. INCIDENT AUDIT

Incidents must be linked to:

```text
tasks
agents
tools
providers
keys
plugins
MCPs
artifacts
```

---

# 288. CHANGE MANAGEMENT

Every production-impacting change must define:

```text
scope
risk
migration
rollback
validation
```

---

# 289. CANARY RELEASE

Optional for plugins/provider adapters:

```text
5% tasks
then
25%
then
100%
```

based on health.

---

# 290. ADAPTIVE HEALTH

System may automatically reduce routing to unhealthy provider/plugin/connector.

---

# 291. CIRCUIT BREAKERS

Apply to:

```text
provider
MCP
external API
remote executor
```

---

# 292. ALERT THRESHOLDS

Configurable:

```text
error rate
latency
429 rate
cost
storage
queue depth
```

---

# 293. QUEUE DEPTH MONITORING

Task queues show:

```text
queued
running
blocked
waiting
```

---

# 294. BACKPRESSURE

When resources are exhausted:

```text
queue
pause
reduce concurrency
```

rather than spawning unlimited work.

---

# 295. FAIR QUEUING

User/project/task priorities must be respected.

---

# 296. STARVATION PREVENTION

Low-priority jobs eventually receive service subject to configured quotas.

---

# 297. DEADLINE PRIORITY

Near-deadline tasks may receive increased priority if policy permits.

---

# 298. COST-BASED QUEUING

Optional policy can prioritize cheaper execution when quality requirements are unchanged.

---

# 299. QUALITY-BASED QUEUING

High-risk tasks may receive stronger models and additional review.

---

# 300. USER OVERRIDES

Users may explicitly change:

```text
priority
model
key pool
agent count
workflow
executor
```

unless global policy prevents it.

---

# 301. PROFILE SYSTEM

Built-in profiles:

```text
minimal
coding
research
browser
multimodal
multi-agent
secure
offline
maximum
```

---

# 302. MINIMAL PROFILE

Use:

```text
one model
minimal tools
no background agents
no remote execution
```

---

# 303. CODING PROFILE

Use:

```text
code index
LSP
Git
shell
tests
review
```

---

# 304. RESEARCH PROFILE

Use:

```text
web
documents
citations
memory
long context
```

---

# 305. BROWSER PROFILE

Use:

```text
browser
screenshots
console
network
artifacts
```

---

# 306. MULTIMODAL PROFILE

Use:

```text
attachments
OCR
document extraction
vision/audio/video
multimodal models
```

---

# 307. MULTI-AGENT PROFILE

Use:

```text
task board
worktrees
agent teams
parallel workers
review
```

---

# 308. SECURE PROFILE

Use:

```text
readonly default
approved provider list
no remote
strict secret policy
mandatory verification
```

---

# 309. OFFLINE PROFILE

Use:

```text
local providers
local tools
local memory
network disabled
```

---

# 310. MAXIMUM PROFILE

May enable:

```text
strong models
parallel agents
cross-provider review
larger budgets
remote workers
```

but cannot override global security rules.

---

# 311. CUSTOM PROFILE

User may define:

```json
{
  "name": "my-production-profile",
  "models": {},
  "agents": {},
  "tools": {},
  "mcps": {},
  "permissions": {},
  "budgets": {}
}
```

---

# 312. CONFIGURATION UI

`/settings` must support:

```text
General
Projects
Models
Providers
API Keys
Context
Memory
Tools
MCP
Plugins
Skills
Agents
Orchestration
Permissions
Security
Privacy
Storage
Notifications
Theme
```

---

# 313. SETTINGS EXPLAIN

```text
/settings explain models.coder
```

shows:

```text
effective value
source
override chain
```

---

# 314. SETTINGS VALIDATION

Invalid configuration should:

```text
block startup if unsafe
warn if recoverable
offer correction
```

---

# 315. COMMAND CONFIGURATION

Users may customize:

- aliases;
- shortcuts;
- defaults;
- profiles.

Core command semantics remain stable.

---

# 316. CUSTOM SHORTCUTS

Example:

```text
Ctrl+Shift+U -> /ultrareview
```

---

# 317. CUSTOM THEMES

Theme schema should be versioned.

---

# 318. CUSTOM TUI LAYOUT

Future support may allow:

```text
panel order
panel visibility
panel sizes
```

---

# 319. WEB UI REQUIREMENTS

Optional web UI should mirror:

```text
projects
sessions
agents
tasks
context
memory
artifacts
approvals
stats
```

---

# 320. MOBILE CONTROL REQUIREMENT

Future remote/mobile client should at minimum support:

```text
task status
agent status
approval
steering
resume
artifact review
```

---

# 321. DESKTOP INTEGRATION

Optional future notifications via:

```text
native OS notifications
```

---

# 322. IDE INTEGRATION

Optional bridges:

```text
VS Code
JetBrains
Neovim
```

Capabilities:

```text
open file
reveal symbol
show diagnostic
show diff
open artifact
open session
```

---

# 323. IDE EVENT BRIDGE

IDE integrations subscribe to the same event stream.

---

# 324. BROWSER EVENT BRIDGE

Browser tools return artifacts/events through the same system.

---

# 325. EXTERNAL API CONNECTOR UX

Connector setup:

```text
/connectors
/connectors add
/connectors inspect
/connectors test
/connectors enable
/connectors disable
```

---

# 326. CONNECTOR DASHBOARD

Shows:

```text
name
type
status
credentials
permissions
latency
last error
```

---

# 327. GITHUB UX

Potential:

```text
/pr create
/pr inspect
/pr review
/pr checks
/pr merge
```

---

# 328. CI UX

Potential:

```text
/ci status
/ci run
/ci logs
/ci retry
```

---

# 329. GIT UX

Potential:

```text
/git status
/git diff
/git branches
/git commits
/git blame
/git worktrees
```

---

# 330. RELEASE UX

Potential workflow:

```text
/release plan
/release review
/release verify
/release package
/release deploy
```

All privileged actions use the policy engine.

---

# 331. NOTIFICATION SETTINGS

Users can configure:

```text
event
channel
priority
quiet hours
deduplication
```

---

# 332. QUIET HOURS

Notifications may be suppressed, but critical/security events can remain allowed according to policy.

---

# 333. LOCALIZATION

The architecture should not hard-code English-only text in the runtime.

Localization can be added later.

---

# 334. INTERNATIONALIZATION

Command names remain stable; human-readable messages are translatable.

---

# 335. ERROR MESSAGE STANDARD

Every error should provide:

```text
code
summary
cause
impact
suggested action
correlation ID
```

---

# 336. ERROR EXAMPLE

```text
E-PROVIDER-429

Provider rate limit reached.

Provider: OpenRouter
Model: model-x
Key: key-B
Retry: 34 seconds

Action:
  scheduler moved request to key-A
```

---

# 337. USER-FACING ERROR GUIDANCE

Error messages should tell users what they can do:

```text
/mcps enable playwright
/api key add openrouter
/index rebuild
/doctor
```

---

# 338. RECOVERY EXPLANATION

When automatic recovery occurs:

```text
Recovery:
  Provider returned 429.
  Selected alternate API key.
  Request was safe to retry.
```

---

# 339. MODEL ROUTE EXPLANATION

```text
/model route explain
```

shows:

```text
required: vision + toolCalling + 128k
selected: provider/model
reason: capability + cost + health
```

---

# 340. CONTEXT ROUTE EXPLANATION

```text
/context provenance
```

shows why context items were selected.

---

# 341. AGENT ROUTE EXPLANATION

```text
/agents inspect
```

shows:

```text
role
model
skills
tools
permissions
budget
executor
```

---

# 342. WORKFLOW ROUTE EXPLANATION

```text
/orchestrate inspect
```

shows:

```text
tasks
dependencies
agents
models
keys
MCP
tools
permissions
budgets
```

---

# 343. ARTIFACT EXPLANATION

Artifact inspection shows:

```text
created by
task
agent
tool
source
verification
hash
```

---

# 344. MEMORY EXPLANATION

Memory inspection shows:

```text
fact
scope
source
confidence
freshness
```

---

# 345. PROJECT HEALTH

`/projects info` should optionally include:

```text
index health
memory health
Git state
environment health
active agents
open tasks
```

---

# 346. PROJECT "RECENT" SEMANTICS

Recent projects sorted by:

```text
last opened
last task
last activity
```

The UI should expose which sort is currently used.

---

# 347. SESSION SEARCH RANKING

Session search should rank:

```text
exact match
semantic match
recency
project relevance
task similarity
```

---

# 348. SIMILAR-TASK DISCOVERY

Before a new task, Anantham may suggest:

```text
3 similar previous tasks found
```

The user may include them in context.

---

# 349. TASK TEMPLATE SUGGESTIONS

Based on task intent:

```text
bugfix
feature
refactor
review
research
release
```

Anantham can suggest a workflow profile.

---

# 350. NO SILENT WORKFLOW CHANGES

Suggestions do not automatically change the task unless user/policy allows.

---

# 351. USER FEEDBACK

Users can comment on artifacts:

```text
/review comment
```

or interactive artifact comments in UI.

---

# 352. FEEDBACK AS STRUCTURED DATA

Feedback fields:

```text
artifact
location
comment
severity
user
timestamp
```

---

# 353. TASK ACCEPTANCE

User may mark:

```text
accepted
rejected
needs changes
```

This is distinct from automated verification.

---

# 354. HUMAN ACCEPTANCE

High-impact production workflows may require both:

```text
automated verification
+
human acceptance
```

---

# 355. FINAL TASK STATE

Possible final states:

```text
COMPLETED
COMPLETED_WITH_WARNINGS
REJECTED
FAILED
CANCELLED
BLOCKED
```

---

# 356. PRODUCTION DEPLOYMENT

Deployment requires:

```text
verification
policy
approval
audit
artifact
```

---

# 357. DEPLOYMENT PREVIEW

Before deployment:

```text
environment
version
changes
tests
risk
rollback target
```

---

# 358. DEPLOYMENT ROLLBACK

Future deployment integrations should record rollback target.

---

# 359. DOMAIN-SPECIFIC EXTENSIONS

Anantham should support specialized verifiers for:

```text
web
mobile
backend
database
ML
data pipelines
infra
security
```

---

# 360. TEST DATA SAFETY

Agent workflows using test databases must clearly distinguish:

```text
test
staging
production
```

---

# 361. ENVIRONMENT TAGGING

Tasks and tools can declare environment:

```text
local
test
staging
production
```

---

# 362. PRODUCTION DATA POLICY

Production data must use stricter policies.

---

# 363. TASK ENVIRONMENT MISMATCH

If task says staging but tool targets production:

```text
BLOCK
```

unless explicit override exists.

---

# 364. SECURITY REVIEW BEFORE DEPLOY

Optional rule:

```text
deployment requires /review --severity blocker
```

---

# 365. COMPLIANCE REPORT

Future enterprise workflow can generate:

```text
who
what
why
provider
data
verification
approval
deployment
```

---

# 366. AUDIT EXPORT

Export formats:

```text
JSON
JSONL
CSV
Markdown
```

---

# 367. LOG REDACTION TEST

CI must test that:

```text
known fixture secrets
```

never appear in exported logs.

---

# 368. MODEL PROMPT REDACTION TEST

Same principle for model requests.

---

# 369. BACKUP RESTORE TEST

CI should periodically:

```text
create test DB
run workload
backup
delete DB
restore
verify checksum/event count/state
```

---

# 370. MIGRATION TEST

Test:

```text
old version fixture
 ->
new version
 ->
resume task
```

---

# 371. UPGRADE RESUME TEST

An active task from previous version should be recoverable when migration compatibility allows it.

---

# 372. PLUGIN COMPATIBILITY TEST

Test active tasks across plugin update boundary.

---

# 373. WORKFLOW COMPATIBILITY TEST

Old workflow run must remain pinned.

---

# 374. KEY ROTATION TEST

Test:

```text
active key
disable
new key
resume
```

---

# 375. PROVIDER MIGRATION TEST

Test:

```text
provider A
checkpoint
provider B
resume
```

---

# 376. CONTEXT WINDOW DOWNGRADE TEST

Test:

```text
large-context model
checkpoint
smaller-context model
resume
```

Verify context is reconstructed safely.

---

# 377. MULTIMODAL MODEL SWITCH TEST

Test:

```text
vision model
checkpoint
text-only model
resume
```

Verify appropriate transformations.

---

# 378. TOOL AVAILABILITY CHANGE TEST

Test:

```text
MCP enabled
checkpoint
MCP disabled
resume
```

Ensure task enters recoverable waiting state if required.

---

# 379. WORKFLOW CAPABILITY CHECK

When resuming, verify required capabilities again.

---

# 380. ARTIFACT INTEGRITY TEST

Artifact hash must match stored content.

---

# 381. ATTACHMENT INTEGRITY TEST

Same.

---

# 382. MEMORY INTEGRITY TEST

Memory source references must resolve or be explicitly marked historical/unavailable.

---

# 383. EVENT INTEGRITY TEST

Event sequence must remain internally consistent.

---

# 384. EVENT REPLAY TEST

Rebuild projections from events and compare:

```text
task state
session state
stats
audit
```

---

# 385. PROJECTION DIVERGENCE TEST

Intentionally corrupt a derived projection and verify automatic detection/rebuild.

---

# 386. USER-FACING RECOVERY

The user must never be expected to manually edit SQLite.

---

# 387. SUPPORT DIAGNOSTICS

Provide:

```text
/doctor
/doctor export
```

for support cases.

---

# 388. VERSION REPORT

`/about` should show:

```text
Anantham version
runtime version
DB schema
plugin runtime
MCP runtime
Git
Node
OS
```

---

# 389. SYSTEM INFO REDACTION

No secrets in `/about` or diagnostics.

---

# 390. TELEMETRY CONFIGURATION

Users control:

```text
telemetry off
metadata
full
```

subject to organizational policy.

---

# 391. PRIVACY DEFAULT

Default local-first privacy:

```text
no external telemetry
```

unless user explicitly enables it.

---

# 392. USER DATA OWNERSHIP

Anantham must provide export and deletion controls.

---

# 393. DELETION SCOPE

Deleting a project may affect:

```text
memory
sessions
artifacts
attachments
indexes
stats
worktrees
```

The UI previews the exact scope.

---

# 394. PROJECT DELETE CONFIRMATION

Must require explicit confirmation for destructive deletion.

---

# 395. SESSION DELETE

Session deletion should preserve unrelated project data.

---

# 396. MEMORY DELETE

Memory deletion must invalidate derived search/index/cache entries.

---

# 397. ARTIFACT DELETE

Only delete artifact if not referenced by live state unless explicitly forced.

---

# 398. REFERENCE COUNT

Artifacts/content should track reference counts or equivalent liveness information.

---

# 399. CONTENT GARBAGE COLLECTION

Only unreferenced derived content is safe for automatic collection.

---

# 400. RELEASE DEFINITION

Anantham is production-ready only when:

```text
all P0 requirements
+
all critical safety invariants
+
durability validation
+
resume validation
+
provider validation
+
MCP validation
+
multimodal validation
+
parallelism validation
+
security validation
+
upgrade validation
```

are complete.

---

# 401. MASTER DEFINITION OF DONE

## Product

- [ ] Projects
- [ ] Sessions
- [ ] `/resume`
- [ ] Checkpoints
- [ ] Memory
- [ ] `/context`
- [ ] `/compact`
- [ ] Attachments
- [ ] Multimodal
- [ ] Artifacts

## Models

- [ ] Model adapters
- [ ] Provider adapters
- [ ] OpenRouter
- [ ] Multiple API keys
- [ ] Key pools
- [ ] Model routing
- [ ] Capability negotiation
- [ ] Failover

## Agents

- [ ] Roles
- [ ] Subagents
- [ ] Task board
- [ ] Agent Teams
- [ ] Parallel execution
- [ ] Worktrees
- [ ] Background agents
- [ ] Recovery

## Tools

- [ ] Native tools
- [ ] Tool gateway
- [ ] Deferred schemas
- [ ] Tool pruning
- [ ] MCP
- [ ] Plugins
- [ ] Skills
- [ ] Hooks

## Orchestration

- [ ] DAG
- [ ] Workflow DSL
- [ ] Global workflows
- [ ] Project workflows
- [ ] Versioning
- [ ] Dry run
- [ ] Resume

## Code intelligence

- [ ] AST
- [ ] Symbols
- [ ] Semantic search
- [ ] LSP
- [ ] Diagnostics
- [ ] Git intelligence
- [ ] Incremental indexing

## Security

- [ ] Policy engine
- [ ] Approvals
- [ ] Sandbox
- [ ] Secret redaction
- [ ] Prompt injection defenses
- [ ] Data classification
- [ ] Privacy controls
- [ ] Audit

## UX

- [ ] CLI
- [ ] TUI
- [ ] `/theme`
- [ ] project browser
- [ ] agent manager
- [ ] artifact view
- [ ] context view
- [ ] memory view
- [ ] notifications
- [ ] headless mode

## Operations

- [ ] Backup
- [ ] Restore
- [ ] Migration
- [ ] Crash recovery
- [ ] `/doctor`
- [ ] Observability
- [ ] Benchmarking
- [ ] Replay

---

# 402. MASTER RELEASE CHECKLIST

Before declaring the product stable:

```text
ARCHITECTURE
[ ] ADRs complete
[ ] contracts versioned
[ ] dependency graph validated

DURABILITY
[ ] event log durable
[ ] checkpoints durable
[ ] artifact integrity
[ ] backup/restore
[ ] crash recovery
[ ] migration

MULTIMODAL
[ ] images
[ ] documents
[ ] PDFs
[ ] spreadsheets
[ ] audio
[ ] video
[ ] archives
[ ] unknown binary safety

MODELS
[ ] OpenRouter
[ ] direct provider
[ ] custom provider
[ ] multiple keys
[ ] failover
[ ] capability routing

AGENTS
[ ] subagents
[ ] teams
[ ] parallel
[ ] worktrees
[ ] background
[ ] recovery

INTEGRATIONS
[ ] MCP
[ ] plugins
[ ] skills
[ ] hooks
[ ] connectors
[ ] GitHub/CI

SECURITY
[ ] prompt injection
[ ] secret leakage
[ ] command injection
[ ] path traversal
[ ] permission bypass
[ ] supply chain

UX
[ ] CLI
[ ] TUI
[ ] context
[ ] memory
[ ] artifacts
[ ] notifications

EVALUATION
[ ] resume
[ ] compaction
[ ] multimodal
[ ] provider failover
[ ] parallelism
[ ] security
[ ] retrieval
[ ] false completion

RELEASE
[ ] license audit
[ ] SBOM
[ ] packaging
[ ] docs
[ ] runbooks
[ ] support bundle
```

---

# 403. FINAL PRODUCT ARCHITECTURE

```text
                             ANANTHAM
                                |
      +-------------------------+-------------------------+
      |                         |                         |
   CONTROL                    DATA                    KNOWLEDGE
      |                         |                         |
 Projects                   Content                 Code Index
 Sessions                   Attachments              AST/LSP
 Tasks                      Documents                Symbols
 Agents                     Images                   Git Graph
 Teams                      Audio                    Memory
 Workflows                  Video                    Sessions
 Policy                     Artifacts                Knowledge Base
 Approvals                  Provenance
 Scheduler
      |
      +------------------------+-------------------------+
                               |
                         AGENT RUNTIME
                               |
                +--------------+--------------+
                |                             |
           MODEL PLANE                    CAPABILITY PLANE
                |                             |
         Model Router                 Tools / MCP / APIs
         Provider Adapters            Plugins / Skills
         API Key Pools                Browser / Connectors
                |                             |
                +--------------+--------------+
                               |
                         EXECUTION PLANE
                               |
             +-----------------+------------------+
             |                 |                  |
           Local             Docker             Remote
             |                 |                  |
             +-----------------+------------------+
                               |
                         VERIFICATION
                               |
                         ARTIFACTS
                               |
                         EVENT STORE
                               |
                            RESUME
                               |
                            REPLAY
```

---

# 404. COMPLETE ANANTHAM COMMAND MAP

```text
PROJECT
/projects
/projects add
/projects remove
/projects use
/projects search
/projects filter
/projects recent
/projects info
/projects archive
/projects restore
/projects prune

SESSION
/session
/session list
/session search
/session rename
/session fork
/session delete
/resume
/tree
/fork
/clone
/checkpoint
/rewind
/rollback
/restore

CONTEXT
/context
/context detail
/context files
/context memory
/context tools
/context skills
/context attachments
/context artifacts
/context history
/context budget
/context provenance
/context export
/context simulate

COMPACTION
/compact
/compact preview
/compact aggressive
/compact conservative
/compact undo
/autocompact

MEMORY
/memory
/memory show
/memory project
/memory session
/memory agent
/memory global
/memory search
/memory add
/memory forget
/memory refresh
/memory export
/memory stats

CONTENT
/attach
/search
/index

MODEL/API
/model
/models
/provider
/api
/auth
/credentials
/profiles

AGENTS
/agents
/tasks
/teams

TOOLS/EXTENSIONS
/tools
/mcps
/plugins
/skills
/hooks
/commands

ORCHESTRATION
/orchestrate
/workflow

PLANNING/REVIEW
/plan
/analyze
/review
/ultrareview

SECURITY
/permissions
/policy
/mode
/audit
/privacy

WORKSPACE
/directory
/shells
/worktrees

OBSERVABILITY
/stats
/history
/doctor

ARTIFACTS
/artifacts

EVALUATION
/evals
/bench
/replay

INTEGRATIONS
/pr
/ci
/connectors

OPERATIONS
/backup
/export
/import
/cleanup
/settings
/theme
/notifications

SYSTEM
/about
/init
/vim
/clear
/quit
```

---

# 405. FINAL ENGINEERING PRIORITY

The product must not be implemented command-first.

The dependency order is:

```text
1. durable state
2. project/session/task
3. content/artifacts
4. model/provider
5. runtime
6. context/retrieval
7. tools/policy
8. memory
9. MCP/plugins/skills/hooks
10. agents/teams
11. execution/remote
12. orchestration
13. verification
14. CLI/TUI
15. integrations
16. evaluation
17. hardening
```

This prevents the UI from becoming a disconnected shell around unfinished runtime primitives.

---

# 406. FINAL PRODUCTION PRINCIPLE

Anantham is successful only if the following remains true:

```text
ANY PROJECT
ANY SESSION
ANY MODEL
ANY API KEY POOL
ANY SUPPORTED CONTENT
ANY TOOL
ANY MCP
ANY PLUGIN
ANY SKILL
ANY AGENT
ANY WORKFLOW
ANY EXECUTOR

        |
        v

   ONE DURABLE RUNTIME

        |
        +-- CONTEXT
        +-- MEMORY
        +-- POLICY
        +-- EXECUTION
        +-- VERIFICATION
        +-- ARTIFACTS
        +-- OBSERVABILITY
        +-- RECOVERY
        +-- RESUME
        +-- REPLAY
```

The user should not have to choose a different runtime merely because a different model, MCP, file type, workflow, project, agent or execution target is required.

---

# 407. FINAL PRODUCTION ACCEPTANCE STATEMENT

Anantham may be called **Production Ready** only when objective evidence demonstrates:

1. committed state survives ordinary application failure;
2. `/resume` successfully reconstructs recoverable tasks;
3. project memory is isolated and retrievable;
4. context can be inspected and safely compacted;
5. supported multimodal inputs are transformed correctly;
6. model providers and API keys can fail without state loss;
7. parallel agents do not silently corrupt shared source;
8. MCP/plugins/skills cannot bypass policy;
9. high-risk actions are auditable;
10. verification prevents false completion at the agreed benchmark threshold;
11. backups can be restored;
12. migrations preserve active/recoverable state;
13. replay/evaluation can detect regressions;
14. performance remains within defined targets.

---

# 408. END OF ANANTHAM PRD V2 — PART 3

Together, Parts 1, 2 and 3 constitute the **Anantham V2 Master Production Requirements Document**.

Part 1 defines the durable product/data/knowledge foundation.

Part 2 defines models, integrations, agents, execution and orchestration.

Part 3 defines the complete product surface, security, operations, evaluation and production release contract.
