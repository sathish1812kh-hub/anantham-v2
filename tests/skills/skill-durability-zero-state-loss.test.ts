import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { SkillManager } from "../../src/skills/skill-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P5.3 Skills — Durability & Event Sourcing Audit", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_skill_dur",
      name: "Project Skill Durability",
      rootPath: "C:/work",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "trusted",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    eventStore = new EventStore(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("emits immutable audit events to SQLite EventStore across skill lifecycle", () => {
    const manager = new SkillManager({ eventStore, projectId: "prj_skill_dur" });

    const rawSkillMd = `---
name: audit-reporter
description: Audit reporting skill.
version: 1.0.0
---
# Audit Reporter
## Preconditions
- Files ready.
## Procedure
1. Generate audit.
## Success criteria
- Report written.
`;

    manager.install(rawSkillMd);
    manager.disable("audit-reporter");
    manager.enable("audit-reporter");
    manager.recordExecution("audit-reporter", {
      projectId: "prj_skill_dur",
      taskId: "task_test_01",
      toolsUsed: ["filesystem.read"],
    });

    const events = eventStore.getEventsByProject("prj_skill_dur");
    expect(events.length).toBeGreaterThanOrEqual(4);

    const installed = events.find((e) => e.type === EventTypes.SKILL_INSTALLED);
    const disabled = events.find((e) => e.type === EventTypes.SKILL_DISABLED);
    const enabled = events.find((e) => e.type === EventTypes.SKILL_ENABLED);
    const executed = events.find((e) => e.type === EventTypes.SKILL_EXECUTED);

    expect(installed).toBeDefined();
    expect(disabled).toBeDefined();
    expect(enabled).toBeDefined();
    expect(executed).toBeDefined();
  });
});
