# Dependency Registry — Anantham V2

This document tracks all production and development dependencies, ensuring strict zero-bloat adherence and vulnerability auditing.

---

## Production Dependencies (`dependencies`)

| Package | Version | Purpose | Justification |
| :--- | :--- | :--- | :--- |
| **`zod`** | `^3.24.2` | Runtime schema validation & type inference | High-performance schema validation for all domain entities, tool parameters, and events. |

*Note: Persistence uses Node.js standard library `node:sqlite` (`DatabaseSync`), requiring zero external native binary dependencies.*

---

## Development Dependencies (`devDependencies`)

| Package | Version | Purpose | Justification |
| :--- | :--- | :--- | :--- |
| **`typescript`** | `^5.7.3` | Strict static type checking and compilation | Language compiler enforcing `strict: true`, `noImplicitAny`, and exact types. |
| **`vitest`** | `^3.0.7` | High-speed unit & integration test runner | Native ESM test framework with instant execution and coverage metrics. |
| **`@types/node`** | `^22.13.5` | TypeScript type definitions for Node.js | Types for `node:sqlite`, `node:fs`, `node:crypto`, and `node:path`. |

---

## Dependency Invariants

1. **No External DB Binaries**: SQLite must remain native via `node:sqlite`.
2. **No Monolithic Frameworks**: Avoid bloated ORMs (Prisma/TypeORM) or heavy web frameworks in the core runtime engine.
3. **Strict Version Locking**: Exact versions enforced via `package-lock.json`.
