---
name: tool-gateway-security-prober
description: Probes capability matching, ToolGateway permission policies, risk classification, approval gates, prompt-injection isolation, and sandbox resource boundaries in Anantham V2.
---

# ToolGateway Security Prober Skill

Use this skill when developing tools, executors, approval gates, or security policies.

## Core Rules

1. **Zero Untrusted Execution**:
   - Models/agents can NEVER execute tools directly. All tool execution must route through the `ToolGateway`.
2. **Schema & Policy Gate**:
   - `ToolGateway.execute(toolId, params, context)` validates:
     1. Parameter schema via Zod.
     2. Agent capabilities & clearance level.
     3. Risk classification (Low / Medium / High / Critical).
     4. Required human-in-the-loop approvals for High/Critical risk actions.
3. **Audit Provenance**:
   - Tool execution start and completion/failure events are durably recorded in the `EventStore` with full input/output provenance and hashes.
