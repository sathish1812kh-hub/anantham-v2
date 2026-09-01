# Anantham V2 — Programmable AI Agent Operating Environment

**Version**: `2.0.0-alpha.1` | **Release Channel**: `alpha` | **Durability**: `RPO 0 (SQLite WAL)`

Anantham V2 is an event-sourced, durable, autonomous multi-agent runtime built with RPO 0 durability, strict capability-based security boundaries (ToolGateway), deterministic state reconstruction reducers, and native SQLite WAL storage.

---

## Key Architecture Principles

1. **RPO 0 Durability**: Authoritative mutations are committed to native `node:sqlite` in WAL mode (`synchronous = FULL`).
2. **Append-Only Immutable Event Sourcing**: Zero historical mutation; compensations and invalidations preserve full auditability.
3. **Strict ToolGateway Isolation**: Agents never invoke tools directly; all actions pass through capability matching, schema validation, and policy approval gates.
4. **Deterministic Multi-Agent Coordination**: Worktree isolation, leases with monotonic generation tokens, and DAG workflow execution.
5. **Zero-Secret Leakage**: In-flight secret scrubbing, encrypted storage boundaries, and secure credential leasing.

---

## Installation & Quickstart

```bash
# Global installation
npm install -g anantham-v2

# Start interactive CLI session
anantham

# Start background server
anantham --server --port 3000

# Start Terminal UI
anantham --tui
```

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) for details.
