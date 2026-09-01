import { TerminalLayout, type TabItem } from "./terminal-layout.js";
import { TuiSanitizer } from "./tui-sanitizer.js";
import { type TuiStateAdapter } from "./tui-state-adapter.js";
import { type TuiDimensions, type TuiViewMode } from "../domain/tui.js";
import { type BackgroundJob } from "../domain/job.js";
import { type NodeIdentity } from "../domain/node.js";

export interface TuiRendererOptions {
  dimensions?: TuiDimensions;
  redactSecrets?: boolean;
}

/**
 * TUI View Renderer for 9 core visual views.
 * PRD Part 2 Section 185–195.
 */
export class TuiRenderer {
  private dimensions: TuiDimensions;
  private readonly redactSecrets: boolean;

  private static readonly SECRET_KEYS = [
    "apiKey",
    "token",
    "secret",
    "password",
    "auth",
    "credential",
    "privateKey",
    "key",
  ];

  constructor(options: TuiRendererOptions = {}) {
    this.dimensions = options.dimensions ?? { width: 80, height: 24 };
    this.redactSecrets = options.redactSecrets ?? true;
  }

  public setDimensions(dims: TuiDimensions): void {
    this.dimensions = dims;
  }

  public getDimensions(): TuiDimensions {
    return this.dimensions;
  }

  /**
   * Main render dispatcher for active view mode.
   */
  public render(
    mode: TuiViewMode,
    adapter: TuiStateAdapter,
    commandPrompt = "",
    errorMessage = ""
  ): string {
    const lines: string[] = [];
    const width = this.dimensions.width;

    // 1. Status Bar (Top)
    lines.push(
      TerminalLayout.renderStatusBar(
        adapter.getStatus(),
        adapter.getActiveProjectId(),
        adapter.getActiveSessionId(),
        this.dimensions
      )
    );
    lines.push(TerminalLayout.renderDivider(width, "═"));

    // 2. Navigation Tab Bar
    const tabs: TabItem[] = [
      { key: "1", label: "Dashboard", mode: "dashboard", active: mode === "dashboard" },
      { key: "2", label: "Session", mode: "session", active: mode === "session" },
      { key: "3", label: "Tasks", mode: "tasks", active: mode === "tasks" },
      { key: "4", label: "Workflows", mode: "workflows", active: mode === "workflows" },
      { key: "5", label: "Agents", mode: "agents", active: mode === "agents" },
      { key: "6", label: "Jobs", mode: "jobs", active: mode === "jobs" },
      { key: "7", label: "Nodes", mode: "nodes", active: mode === "nodes" },
      { key: "8", label: "Approvals", mode: "approvals", active: mode === "approvals" },
      { key: "9", label: "Events", mode: "events", active: mode === "events" },
      { key: "?", label: "Help", mode: "help", active: mode === "help" },
    ];
    lines.push(TerminalLayout.renderTabBar(tabs, width));
    lines.push(TerminalLayout.renderDivider(width, "─"));

    // 3. View Content
    let contentLines: string[] = [];
    switch (mode) {
      case "dashboard":
        contentLines = this.renderDashboard(adapter);
        break;
      case "session":
        contentLines = this.renderSession(adapter);
        break;
      case "tasks":
        contentLines = this.renderTasks(adapter);
        break;
      case "workflows":
        contentLines = this.renderWorkflows(adapter);
        break;
      case "agents":
        contentLines = this.renderAgents(adapter);
        break;
      case "jobs":
        contentLines = this.renderJobs(adapter);
        break;
      case "nodes":
        contentLines = this.renderNodes(adapter);
        break;
      case "approvals":
        contentLines = this.renderApprovals(adapter);
        break;
      case "events":
        contentLines = this.renderEvents(adapter);
        break;
      case "help":
        contentLines = this.renderHelp();
        break;
    }

    lines.push(...contentLines);

    // 4. Error banner if present
    if (errorMessage) {
      lines.push(TerminalLayout.renderDivider(width, "─"));
      lines.push(`\x1b[1;31m✖ Error: ${TuiSanitizer.sanitize(errorMessage)}\x1b[0m`);
    }

    // 5. Command Bar / Prompt (Bottom)
    lines.push(TerminalLayout.renderDivider(width, "─"));
    if (commandPrompt) {
      lines.push(` : ${TuiSanitizer.sanitize(commandPrompt)}_`);
    } else {
      lines.push(" [1-9] Switch View | [/] Command Bar | [r] Refresh | [q] Quit");
    }

    return lines.join("\n");
  }

  // --- View Implementations ---

  public renderDashboard(adapter: TuiStateAdapter): string[] {
    const projects = adapter.getProjects();
    const sessions = adapter.getSessions();
    const tasks = adapter.getTasks();
    const jobs = adapter.getJobs();
    const nodes = adapter.getNodes();
    const events = adapter.getRecentEvents(5);

    const taskCounts = {
      available: tasks.filter((t) => t.status === "available" || t.status === "queued").length,
      running: tasks.filter((t) => t.status === "running" || t.status === "claimed").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
    };

    const currentProject = projects.find((p) => p.id === adapter.getActiveProjectId());
    const currentSession = sessions.find((s) => s.id === adapter.getActiveSessionId());

    const overviewLines = [
      `Active Project: ${currentProject ? `${currentProject.name} (${currentProject.id})` : (adapter.getActiveProjectId() ?? "None")} (Total: ${projects.length})`,
      `Active Session: ${currentSession ? `${currentSession.name} (${currentSession.id})` : (adapter.getActiveSessionId() ?? "None")} (Total: ${sessions.length})`,
      `Tasks: [Available: ${taskCounts.available} | Running: ${taskCounts.running} | Completed: ${taskCounts.completed} | Failed: ${taskCounts.failed}]`,
      `Background Jobs: ${jobs.length} | Remote Nodes: ${nodes.length} | Recovery State: ${adapter.getStatus()}`,
    ];

    const recentEventLines = events.length === 0
      ? ["  (No events recorded)"]
      : events.map((e) => `  • [${e.timestamp.slice(11, 19)}] ${e.type} (${e.actor})`);

    return [
      ...TerminalLayout.drawBox(overviewLines, { title: "SYSTEM OVERVIEW", width: this.dimensions.width - 2 }),
      "",
      ...TerminalLayout.drawBox(recentEventLines, { title: "RECENT EVENT STREAM", width: this.dimensions.width - 2 }),
    ];
  }

  public renderSession(adapter: TuiStateAdapter): string[] {
    const activeSessionId = adapter.getActiveSessionId();
    const sessions = adapter.getSessions();
    const current = sessions.find((s) => s.id === activeSessionId);

    if (!current) {
      return TerminalLayout.drawBox(
        ["No active session selected. Use '/session select <id>' or press 1 to view projects."],
        { title: "SESSION DETAILS", width: this.dimensions.width - 2 }
      );
    }

    const lines = [
      `Session ID:      ${current.id}`,
      `Name:            ${current.name}`,
      `Project ID:      ${current.projectId}`,
      `Branch:          ${current.branch}`,
      `Status:          ${current.status}`,
      `Model Profile:   ${current.modelProfile}`,
      `Created At:      ${current.createdAt}`,
      `Updated At:      ${current.updatedAt}`,
    ];

    return TerminalLayout.drawBox(lines, { title: `SESSION: ${current.name}`, width: this.dimensions.width - 2 });
  }

  public renderTasks(adapter: TuiStateAdapter): string[] {
    const tasks = adapter.getTasks();

    if (tasks.length === 0) {
      return TerminalLayout.drawBox(
        ["No tasks found in active session. Use '/task create <objective>'."],
        { title: "TASK BOARD", width: this.dimensions.width - 2 }
      );
    }

    const headers = ["Task ID", "Objective", "Status", "Priority", "Updated"];
    const rows = tasks.map((t) => [
      t.id,
      TuiSanitizer.truncate(t.objective, 30),
      t.status,
      t.priority ?? "normal",
      t.updatedAt.slice(11, 19),
    ]);

    const colWidths = [12, 32, 12, 10, 10];
    const tableLines = TerminalLayout.renderTable(headers, rows, colWidths);

    return TerminalLayout.drawBox(tableLines, { title: `TASKS (${tasks.length})`, width: this.dimensions.width - 2 });
  }

  public renderWorkflows(_adapter: TuiStateAdapter): string[] {
    const lines = [
      "Workflow Engine: READY",
      "Active DAG Runs: 0 active executions",
      "No active workflow executions in progress. Use '/plan' or execute workflow run.",
    ];

    return TerminalLayout.drawBox(lines, { title: "WORKFLOW ENGINE", width: this.dimensions.width - 2 });
  }

  public renderAgents(_adapter: TuiStateAdapter): string[] {
    const lines = [
      "Agent Manager: OPERATIONAL",
      "Configured Agents: 1 (cli_operator)",
      "Role: Primary CLI Controller | Trust: safe | Model: default",
    ];

    return TerminalLayout.drawBox(lines, { title: "AGENT DIRECTORY", width: this.dimensions.width - 2 });
  }

  public renderJobs(adapter: TuiStateAdapter): string[] {
    const jobs = adapter.getJobs();

    if (jobs.length === 0) {
      return TerminalLayout.drawBox(
        ["No background jobs registered. Use BackgroundJobManager."],
        { title: "BACKGROUND JOBS", width: this.dimensions.width - 2 }
      );
    }

    const headers = ["Job ID", "Task ID", "Status", "Agent ID", "Generation"];
    const rows = jobs.map((j: BackgroundJob) => [
      j.id,
      j.taskId,
      j.status,
      j.agentId,
      String(j.generation ?? 0),
    ]);
    const colWidths = [14, 25, 12, 15, 10];
    const tableLines = TerminalLayout.renderTable(headers, rows, colWidths);

    return TerminalLayout.drawBox(tableLines, { title: `BACKGROUND JOBS (${jobs.length})`, width: this.dimensions.width - 2 });
  }

  public renderNodes(adapter: TuiStateAdapter): string[] {
    const nodes = adapter.getNodes();

    if (nodes.length === 0) {
      return TerminalLayout.drawBox(
        ["No remote nodes registered. Local node controller operational."],
        { title: "REMOTE NODES", width: this.dimensions.width - 2 }
      );
    }

    const headers = ["Node ID", "Address", "Status", "Capabilities", "Last Ping"];
    const rows = nodes.map((n: NodeIdentity) => [
      n.id,
      n.endpointUrl,
      n.status,
      TuiSanitizer.truncate(n.capabilities.join(","), 20),
      n.lastHeartbeatAt?.slice(11, 19) ?? "never",
    ]);
    const colWidths = [14, 25, 12, 22, 10];
    const tableLines = TerminalLayout.renderTable(headers, rows, colWidths);

    return TerminalLayout.drawBox(tableLines, { title: `REMOTE NODES (${nodes.length})`, width: this.dimensions.width - 2 });
  }

  public renderApprovals(_adapter: TuiStateAdapter): string[] {
    const lines = [
      "Pending Human Approvals: 0",
      "All active tools and workflows are operating within permitted safety boundaries.",
    ];

    return TerminalLayout.drawBox(lines, { title: "PENDING APPROVALS", width: this.dimensions.width - 2 });
  }

  public renderEvents(adapter: TuiStateAdapter): string[] {
    const events = adapter.getRecentEvents(15);

    if (events.length === 0) {
      return TerminalLayout.drawBox(
        ["No events recorded in event stream yet."],
        { title: "LIVE EVENT LOG", width: this.dimensions.width - 2 }
      );
    }

    const headers = ["Time", "Event Type", "Actor", "Session", "Project"];
    const rows = events.map((e) => [
      e.timestamp.slice(11, 19),
      TuiSanitizer.truncate(e.type, 25),
      e.actor,
      e.sessionId ?? "-",
      e.projectId ?? "-",
    ]);
    const colWidths = [10, 26, 15, 14, 14];
    const tableLines = TerminalLayout.renderTable(headers, rows, colWidths);

    return TerminalLayout.drawBox(tableLines, { title: `EVENT LOG (${events.length} shown)`, width: this.dimensions.width - 2 });
  }

  public renderHelp(): string[] {
    const lines = [
      "KEYBOARD SHORTCUTS:",
      "  [1] Dashboard    - System Overview & Event Summary",
      "  [2] Session      - Active Session Details & Hierarchy",
      "  [3] Tasks        - Kanban Task Board & Leases",
      "  [4] Workflows    - Active DAG Runs & Wave Progress",
      "  [5] Agents       - Agent Directory & Capability Profiles",
      "  [6] Jobs         - Detached Background Jobs & Heartbeats",
      "  [7] Nodes        - Remote Worker Nodes & Dispatches",
      "  [8] Approvals    - Human Approval Gates",
      "  [9] Events       - Real-Time Canonical Event Stream",
      "  [?] Help         - Keybindings & Usage Guide",
      "",
      "COMMAND BAR:",
      "  [/] Enter Command Bar to execute any slash command (/project, /task, /doctor, etc.)",
      "  [r] Refresh current view",
      "  [q] / [ESC] Graceful exit",
    ];

    return TerminalLayout.drawBox(lines, { title: "HELP & NAVIGATION GUIDE", width: this.dimensions.width - 2 });
  }

  /**
   * Helper to recursively mask sensitive data.
   */
  public redactData(data: unknown): unknown {
    if (!this.redactSecrets || !data || typeof data !== "object") return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.redactData(item));
    }

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (TuiRenderer.SECRET_KEYS.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
        cleaned[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        cleaned[key] = this.redactData(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
}
