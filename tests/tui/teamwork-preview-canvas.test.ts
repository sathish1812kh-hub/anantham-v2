import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import {
  TeamworkPreviewCanvas,
  type AgentTopologyNode,
  type OrchestrationMetricsData,
} from "../../src/tui/teamwork-preview-canvas.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";

describe("M2: Multi-Agent ASCII Orchestration Topology (/teamwork-preview)", () => {
  describe("TeamworkPreviewCanvas — Box, Node & Route Rendering", () => {
    it("renders all 4 agent node boxes", () => {
      const lines = TeamworkPreviewCanvas.render(80, 24, { ansi: false });
      const plain = lines.join("\n");

      expect(plain).toContain("[ ARCHITECT ]");
      expect(plain).toContain("[ CODER ]");
      expect(plain).toContain("[ REVIEWER ]");
      expect(plain).toContain("[ SRE / AUDITOR ]");
    });

    it("renders all interactive dependency graph routing paths", () => {
      const lines = TeamworkPreviewCanvas.render(80, 24, { ansi: false });
      const plain = lines.join("\n");

      // Wave DAG delegation & task contracts
      expect(plain).toContain("Wave DAG Del");
      expect(plain).toContain("Task Contracts");

      // Code diffs & review critique loopback
      expect(plain).toContain("Code Diffs");
      expect(plain).toContain("Critique");

      // Durability verified checkpoints & policy gates
      expect(plain).toContain("Verified Chkpt");
      expect(plain).toContain("Policy Gates");

      // Health / fencing return telemetry
      expect(plain).toContain("Health & Fencing Token");
    });

    it("formats state pills with TrueColor styling when ansi is true", () => {
      const idle = TeamworkPreviewCanvas.formatPill("IDLE", true);
      const planning = TeamworkPreviewCanvas.formatPill("PLANNING", true);
      const executing = TeamworkPreviewCanvas.formatPill("EXECUTING", true);

      // Emerald \x1b[38;2;0;242;152m
      expect(idle).toContain("\x1b[38;2;0;242;152m● [IDLE]\x1b[0m");
      // Amber \x1b[38;2;255;154;60m
      expect(planning).toContain("\x1b[38;2;255;154;60m▲ [PLANNING]\x1b[0m");
      // Cyan \x1b[38;2;0;242;254m
      expect(executing).toContain("\x1b[38;2;0;242;254m⚡ [EXECUTING]\x1b[0m");
    });

    it("formats state pills with exact plain-text fallback glyphs when ansi is false", () => {
      const idle = TeamworkPreviewCanvas.formatPill("IDLE", false);
      const planning = TeamworkPreviewCanvas.formatPill("PLANNING", false);
      const executing = TeamworkPreviewCanvas.formatPill("EXECUTING", false);

      expect(idle).toBe("● [IDLE]");
      expect(planning).toBe("▲ [PLANNING]");
      expect(executing).toBe("⚡ [EXECUTING]");

      // Must not contain any escape characters
      expect(idle).not.toContain("\x1b");
      expect(planning).not.toContain("\x1b");
      expect(executing).not.toContain("\x1b");
    });

    it("renders complete summary metrics block", () => {
      const lines = TeamworkPreviewCanvas.render(80, 24, { ansi: false });
      const plain = lines.join("\n");

      // Parallel worktrees
      expect(plain).toContain("Worktrees : 4 active [/wt/architect, /wt/coder-1, /wt/coder-2, /wt/sre]");

      // Wave DAG fencing token, epoch, and depth
      expect(plain).toContain("Wave DAG  : Token #0x04F2 (Fence: ACTIVE | Epoch: 14 | Depth: 3 waves)");

      // Lease durations, heartbeat, drift
      expect(plain).toContain("Leases    : 4/4 held (TTL: 284s / 300s | Heartbeat: 1.2s ago | Drift: 0ms)");

      // Durability & security
      expect(plain).toContain("Durability: SQLite WAL (synchronous = FULL, RPO-0) | ToolGateway sandboxed");
    });
  });

  describe("Layout Geometry & Terminal Dimensions", () => {
    it("strictly complies with <= 80 columns and <= 17 rows on standard terminal", () => {
      const lines = TeamworkPreviewCanvas.render(80, 24, { ansi: true });

      // Row count constraint
      expect(lines.length).toBeLessThanOrEqual(17);
      expect(lines.length).toBe(16);

      // Column width constraint on every single line
      for (let i = 0; i < lines.length; i++) {
        const cleanLine = TuiSanitizer.stripAnsi(lines[i]!);
        expect(cleanLine.length).toBeLessThanOrEqual(80);
        expect(cleanLine.length).toBe(78);
      }
    });

    it("adapts to single-column vertical pipeline when width < 76", () => {
      const lines = TeamworkPreviewCanvas.render(50, 24, { ansi: false });
      const plain = lines.join("\n");

      expect(plain).toContain("TOPOLOGY PIPELINE");
      expect(plain).toContain("[ ARCHITECT ]");
      expect(plain).toContain("[ CODER ]");
      expect(plain).toContain("[ REVIEWER ]");
      expect(plain).toContain("[ SRE / AUDITOR ]");

      for (const line of lines) {
        const clean = TuiSanitizer.stripAnsi(line);
        expect(clean.length).toBeLessThanOrEqual(50);
      }
    });
  });

  describe("renderText & Backward Compatibility Anchors", () => {
    it("preserves exact integration test anchors in renderText()", () => {
      const text = TeamworkPreviewCanvas.renderText({ ansi: false });

      expect(text).toContain("❖ Teamwork Preview Harness Status: ONLINE");
      expect(text).toContain("Parallel Workers : 4");
      expect(text).toContain("Task Partitioning: Wave DAG with generation-fenced leases");
      expect(text).toContain("Durability       : SQLite WAL (synchronous = FULL, RPO-0)");
      expect(text).toContain("Safety Boundary  : ToolGateway sandboxed capability routing");
      expect(text).toContain("[ ARCHITECT ]");
      expect(text).toContain("[ CODER ]");
    });

    it("supports custom nodes and metrics override", () => {
      const customNodes: AgentTopologyNode[] = [
        {
          id: "architect",
          name: "ARCHITECT",
          role: "Custom Spec",
          state: "IDLE",
          worktree: "/wt/custom-arch",
        },
        {
          id: "coder",
          name: "CODER",
          role: "Custom Coder",
          state: "PLANNING",
          worktree: "/wt/custom-coder",
        },
        {
          id: "reviewer",
          name: "REVIEWER",
          role: "Custom Gate",
          state: "EXECUTING",
          worktree: "/wt/custom-rev",
        },
        {
          id: "sre",
          name: "SRE / AUDITOR",
          role: "Custom ToolGW",
          state: "PLANNING",
          worktree: "/wt/custom-sre",
        },
      ];

      const customMetrics: Partial<OrchestrationMetricsData> = {
        workersCount: 8,
        fencingToken: "0xCAFE",
        epoch: 42,
        depthWaves: 5,
        worktrees: ["/wt/custom-1", "/wt/custom-2"],
      };

      const lines = TeamworkPreviewCanvas.render(80, 24, {
        ansi: false,
        nodes: customNodes,
        metrics: customMetrics,
      });
      const plain = lines.join("\n");

      expect(plain).toContain("Custom Spec");
      expect(plain).toContain("Custom Coder");
      expect(plain).toContain("Custom Gate");
      expect(plain).toContain("Custom ToolGW");
      expect(plain).toContain("Token #0xCAFE");
      expect(plain).toContain("Epoch: 42 | Depth: 5 waves");
      expect(plain).toContain("Worktrees : 8 active [/wt/custom-1, /wt/custom-2]");
    });
  });

  describe("TUI Controller & Renderer Integration", () => {
    let engine: SqliteEngine;
    let projectRepo: ProjectRepository;
    let sessionRepo: SessionRepository;
    let taskRepo: TaskRepository;
    let sessionController: SessionController;
    let commandRegistry: CommandRegistry;
    let parser: CommandParser;
    let stateAdapter: TuiStateAdapter;
    let renderer: TuiRenderer;
    let controller: TuiController;
    let lastOutput = "";

    beforeEach(() => {
      engine = new SqliteEngine({ path: ":memory:" });
      engine.open();
      const migrator = new MigrationEngine(engine);
      migrator.migrate();

      projectRepo = new ProjectRepository(engine);
      sessionRepo = new SessionRepository(engine);
      taskRepo = new TaskRepository(engine);
      sessionController = new SessionController({ projectRepo, sessionRepo });
      commandRegistry = new CommandRegistry({
        sessionController,
        projectRepo,
        taskRepo,
        engine,
      });
      parser = new CommandParser();

      stateAdapter = new TuiStateAdapter({
        projectRepo,
        sessionRepo,
        taskRepo,
      });

      renderer = new TuiRenderer({ dimensions: { width: 90, height: 26 } });

      const mockOutput = new Writable({
        write(chunk, _encoding, callback) {
          lastOutput = chunk.toString();
          callback();
        },
      });

      controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });
      controller.start();
    });

    afterEach(() => {
      controller.stop();
      engine.close();
    });

    it("switches to 'teamwork' view pressing 't' in normal mode", async () => {
      await controller.handleInput("t");
      expect(controller.getCurrentView()).toBe("teamwork");

      controller.renderNow();
      const plain = TuiSanitizer.stripAnsi(lastOutput);
      expect(plain).toContain("MULTI-AGENT ORCHESTRATION TOPOLOGY");
      expect(plain).toContain("[ ARCHITECT ]");
      expect(plain).toContain("[ CODER ]");
    });

    it("switches to 'teamwork' view pressing 'T' in normal mode", async () => {
      await controller.handleInput("T");
      expect(controller.getCurrentView()).toBe("teamwork");
    });

    it("switches to 'teamwork' view executing /teamwork-preview command", async () => {
      await controller.executeCommand("/teamwork-preview");
      expect(controller.getCurrentView()).toBe("teamwork");

      controller.renderNow();
      const plain = TuiSanitizer.stripAnsi(lastOutput);
      expect(plain).toContain("MULTI-AGENT ORCHESTRATION TOPOLOGY");
      expect(plain).toContain("[ REVIEWER ]");
      expect(plain).toContain("[ SRE / AUDITOR ]");
    });

    it("switches to 'teamwork' view executing /teamwork alias", async () => {
      await controller.executeCommand("/teamwork");
      expect(controller.getCurrentView()).toBe("teamwork");
    });

    it("switches to 'teamwork' view executing /preview alias", async () => {
      await controller.executeCommand("/preview");
      expect(controller.getCurrentView()).toBe("teamwork");
    });

    it("renders teamwork view in TuiRenderer directly", () => {
      const rendered = renderer.render("teamwork", stateAdapter);
      expect(rendered).toContain("MULTI-AGENT ORCHESTRATION TOPOLOGY");
      expect(rendered).toContain("[ ARCHITECT ]");
      expect(rendered).toContain("[ CODER ]");
    });

    it("executes /teamwork-preview via commandRegistry and returns rich data", async () => {
      const result = await commandRegistry.execute(parser.parse("/teamwork-preview"));
      expect(result.success).toBe(true);
      expect(result.commandName).toBe("teamwork-preview");
      expect(result.message).toContain("Teamwork Preview Harness Status: ONLINE");
      expect(result.message).toContain("Parallel Workers : 4");
      expect(result.message).toContain("[ ARCHITECT ]");
      expect(result.message).toContain("[ CODER ]");

      const data = result.data as Record<string, unknown>;
      expect(data.status).toBe("ONLINE");
      expect(data.workers).toBe(4);
      expect(data.mode).toBe("wave_dag");
      expect(data.fencingToken).toBe("0x04F2");
      expect(data.epoch).toBe(14);
      expect(data.depthWaves).toBe(3);
      expect(data.leasesHeld).toBe("4/4 held");
      expect(data.durability).toContain("SQLite WAL");
      expect(data.security).toContain("ToolGateway");
    });
  });
});
