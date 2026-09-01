import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { JobRepository } from "../../src/persistence/repositories/job-repository.js";
import { NodeRepository } from "../../src/persistence/repositories/node-repository.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";

describe("P8.2 TUI — Core Views Suite", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let jobRepo: JobRepository;
  let nodeRepo: NodeRepository;
  let adapter: TuiStateAdapter;
  let renderer: TuiRenderer;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    jobRepo = new JobRepository(engine);
    nodeRepo = new NodeRepository(engine);

    // Setup sample data
    projectRepo.save({
      id: "proj_tui",
      name: "TUI Test Project",
      rootPath: "/tui",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_tui",
      projectId: "proj_tui",
      name: "TUI Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    taskRepo.save({
      id: "task_tui_1",
      projectId: "proj_tui",
      sessionId: "sess_tui",
      objective: "Verify TUI rendering",
      status: "available",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    jobRepo.saveJob({
      id: "job_tui_1",
      projectId: "proj_tui",
      sessionId: "sess_tui",
      taskId: "task_tui_1",
      agentId: "agent_operator",
      instanceId: "inst_01",
      status: "RUNNING",
      createdAt: new Date().toISOString(),
      attempt: 1,
      maxRetries: 3,
      generation: 1,
      leaseId: "lease_01",
      payload: {},
      metadata: {},
    });

    nodeRepo.saveNode({
      id: "node_remote_1",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      capabilities: ["docker", "gpu"],
      executorProfiles: ["default"],
      supportedModels: ["gemini-pro"],
      supportedTools: ["bash"],
      projectScope: ["proj_tui"],
      status: "ONLINE",
      endpointUrl: "https://node1.internal:8080",
      registeredAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      metadata: {},
    });

    adapter = new TuiStateAdapter({
      projectRepo,
      sessionRepo,
      taskRepo,
      jobRepo,
      nodeRepo,
      initialProjectId: "proj_tui",
      initialSessionId: "sess_tui",
    });

    renderer = new TuiRenderer({ dimensions: { width: 90, height: 26 } });
  });

  afterEach(() => {
    adapter.destroy();
    engine.close();
  });

  it("renders dashboard view", () => {
    const out = renderer.render("dashboard", adapter);
    expect(out).toContain("SYSTEM OVERVIEW");
    expect(out).toContain("Project: proj_tui");
    expect(out).toContain("TUI Test Project");
  });

  it("renders session view", () => {
    const out = renderer.render("session", adapter);
    expect(out).toContain("SESSION: TUI Session");
    expect(out).toContain("Branch:          main");
  });

  it("renders tasks view", () => {
    const out = renderer.render("tasks", adapter);
    expect(out).toContain("TASKS (1)");
    expect(out).toContain("Verify TUI rendering");
  });

  it("renders workflows view", () => {
    const out = renderer.render("workflows", adapter);
    expect(out).toContain("WORKFLOW ENGINE");
  });

  it("renders agents view", () => {
    const out = renderer.render("agents", adapter);
    expect(out).toContain("AGENT DIRECTORY");
  });

  it("renders background jobs view", () => {
    const out = renderer.render("jobs", adapter);
    expect(out).toContain("BACKGROUND JOBS (1)");
    expect(out).toContain("job_tui_1");
  });

  it("renders remote nodes view", () => {
    const out = renderer.render("nodes", adapter);
    expect(out).toContain("REMOTE NODES (1)");
    expect(out).toContain("node_remote_1");
  });

  it("renders approvals view", () => {
    const out = renderer.render("approvals", adapter);
    expect(out).toContain("PENDING APPROVALS");
  });

  it("renders events view", () => {
    const out = renderer.render("events", adapter);
    expect(out).toContain("LIVE EVENT LOG");
  });

  it("renders help view", () => {
    const out = renderer.render("help", adapter);
    expect(out).toContain("HELP & NAVIGATION GUIDE");
  });
});
