import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import {
  ProjectRepository,
  SessionRepository,
  TaskRepository,
  EventRepository,
  CheckpointRepository,
  ArtifactRepository,
  AttachmentRepository,
  MemoryRepository,
} from "../../src/persistence/index.js";
import type { Project } from "../../src/domain/project.js";
import type { Session } from "../../src/domain/session.js";
import type { Task } from "../../src/domain/task.js";
import type { HarnessEvent } from "../../src/domain/event.js";
import type { Checkpoint } from "../../src/domain/checkpoint.js";
import type { Artifact } from "../../src/domain/artifact.js";
import type { Attachment } from "../../src/domain/attachment.js";
import type { MemoryItem } from "../../src/domain/memory.js";

describe("Domain Repositories CRUD and Invariant Enforcement", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let eventRepo: EventRepository;
  let checkpointRepo: CheckpointRepository;
  let artifactRepo: ArtifactRepository;
  let attachmentRepo: AttachmentRepository;
  let memoryRepo: MemoryRepository;

  const sampleSha = "1".repeat(64);

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    eventRepo = new EventRepository(engine);
    checkpointRepo = new CheckpointRepository(engine);
    artifactRepo = new ArtifactRepository(engine);
    attachmentRepo = new AttachmentRepository(engine);
    memoryRepo = new MemoryRepository(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("performs CRUD operations on ProjectRepository", () => {
    const project: Project = {
      id: "proj_01",
      name: "Anantham Core",
      rootPath: "C:/herness",
      status: "active",
      tags: ["typescript", "sqlite"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:10:00.000Z",
    };

    projectRepo.save(project);
    const found = projectRepo.findById("proj_01");
    expect(found).toEqual(project);

    const list = projectRepo.list({ status: "active" });
    expect(list).toHaveLength(1);

    expect(projectRepo.delete("proj_01")).toBe(true);
    expect(projectRepo.findById("proj_01")).toBeNull();
  });

  it("handles SessionRepository and TaskRepository with state transition enforcement", () => {
    const project: Project = {
      id: "proj_01",
      name: "Project 1",
      rootPath: "C:/herness",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
    };
    projectRepo.save(project);

    const session: Session = {
      id: "sess_01",
      projectId: "proj_01",
      name: "Session 1",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: { "filesystem.read": true },
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    };
    sessionRepo.save(session);

    const task: Task = {
      id: "task_01",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Build persistence",
      status: "queued",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    };
    taskRepo.save(task);

    // Valid state transitions: queued -> claimed -> running -> verifying -> completed
    taskRepo.updateStatus("task_01", "claimed");
    expect(taskRepo.findById("task_01")?.status).toBe("claimed");

    taskRepo.updateStatus("task_01", "running");
    expect(taskRepo.findById("task_01")?.status).toBe("running");

    taskRepo.updateStatus("task_01", "verifying");
    expect(taskRepo.findById("task_01")?.status).toBe("verifying");

    taskRepo.updateStatus("task_01", "completed");
    expect(taskRepo.findById("task_01")?.status).toBe("completed");

    // Invalid transition: completed -> running should throw
    expect(() => taskRepo.updateStatus("task_01", "running")).toThrow(
      /Invalid task state transition/
    );
  });

  it("handles EventRepository with append-only stream semantics", () => {
    const project: Project = {
      id: "proj_01",
      name: "Project 1",
      rootPath: "C:/p",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
    };
    projectRepo.save(project);

    const session: Session = {
      id: "sess_01",
      projectId: "proj_01",
      name: "Session 1",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    };
    sessionRepo.save(session);

    const event1: HarnessEvent = {
      id: "evt_01",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      type: "session.created",
      actor: "user",
      timestamp: "2026-08-30T20:00:00.000Z",
      payload: { mode: "interactive" },
    };

    const event2: HarnessEvent = {
      id: "evt_02",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      type: "task.created",
      actor: "agent",
      timestamp: "2026-08-30T20:00:01.000Z",
      payload: { objective: "task 1" },
    };

    eventRepo.append(event1);
    eventRepo.append(event2);

    expect(eventRepo.countBySession("sess_01")).toBe(2);

    const events = eventRepo.listBySession("sess_01");
    expect(events).toHaveLength(2);
    expect(events[0]?.id).toBe("evt_01");
    expect(events[1]?.id).toBe("evt_02");
    expect(Object.isFrozen(events[0])).toBe(true);
  });

  it("handles CheckpointRepository, ArtifactRepository, AttachmentRepository, and MemoryRepository", () => {
    const project: Project = {
      id: "proj_01",
      name: "Project 1",
      rootPath: "C:/p",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
    };
    projectRepo.save(project);

    const session: Session = {
      id: "sess_01",
      projectId: "proj_01",
      name: "Session 1",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    };
    sessionRepo.save(session);

    // 1. Checkpoint
    const checkpoint: Checkpoint = {
      id: "chk_01",
      type: "automatic",
      projectId: "proj_01",
      sessionId: "sess_01",
      manifest: {
        schemaVersion: 1,
        eventOffset: 10,
        branch: "main",
        taskStateSummary: { t1: "completed" },
        artifactHashes: {},
      },
      sha256: sampleSha,
      createdAt: "2026-08-30T20:00:00.000Z",
      validationChecksum: "val_chk",
    };
    checkpointRepo.save(checkpoint);
    const foundChk = checkpointRepo.findLatestBySession("sess_01");
    expect(foundChk?.id).toBe("chk_01");

    // 2. Artifact
    const artifact: Artifact = {
      id: "art_01",
      type: "report",
      projectId: "proj_01",
      sessionId: "sess_01",
      contentUri: "file:///art.md",
      sha256: sampleSha,
      sourceEventIds: ["evt_01"],
      createdAt: "2026-08-30T20:00:00.000Z",
    };
    artifactRepo.save(artifact);
    expect(artifactRepo.findByHash(sampleSha)?.id).toBe("art_01");

    // 3. Attachment
    const attachment: Attachment = {
      id: "att_01",
      name: "image.png",
      mimeType: "image/png",
      sizeBytes: 1000,
      sha256: sampleSha,
      source: "clipboard",
      projectId: "proj_01",
      sessionId: "sess_01",
      sensitivity: "normal",
      createdAt: "2026-08-30T20:00:00.000Z",
    };
    attachmentRepo.save(attachment);
    expect(attachmentRepo.findById("att_01")?.name).toBe("image.png");

    // 4. MemoryItem
    const memory: MemoryItem = {
      id: "mem_01",
      scope: "project",
      projectId: "proj_01",
      type: "architecture",
      content: "Use WAL mode",
      confidence: 0.99,
      priority: "CRITICAL",
      sourceEventIds: [],
      createdAt: "2026-08-30T20:00:00.000Z",
      sensitivity: "normal",
    };
    memoryRepo.save(memory);
    const memList = memoryRepo.listByScope("project", { projectId: "proj_01" });
    expect(memList).toHaveLength(1);
    expect(memList[0]?.content).toBe("Use WAL mode");
  });
});
