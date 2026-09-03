/**
 * Text User Interface (TUI) Dashboard & Streaming Tool Monitor
 * PRD-TUI-001: Text User Interface (TUI) Dashboard
 * PRD-TUI-004: Dynamic Tool Execution & Streaming Output Monitor
 */

export interface DashboardState {
  sessionId: string;
  activeModel: string;
  activeBranch: string;
  tokenCount: number;
  costUsd: number;
  status: "idle" | "running" | "waiting_approval" | "error";
  runningTool?: {
    toolName: string;
    startedAt: number;
    streamLines: string[];
  };
}

export class TuiDashboard {
  private state: DashboardState;

  constructor(initialState?: Partial<DashboardState>) {
    this.state = {
      sessionId: initialState?.sessionId ?? "default",
      activeModel: initialState?.activeModel ?? "gemini-2.5-pro",
      activeBranch: initialState?.activeBranch ?? "main",
      tokenCount: initialState?.tokenCount ?? 0,
      costUsd: initialState?.costUsd ?? 0.0,
      status: initialState?.status ?? "idle",
      runningTool: initialState?.runningTool,
    };
  }

  public updateState(patch: Partial<DashboardState>): void {
    this.state = { ...this.state, ...patch };
  }

  public startToolExecution(toolName: string): void {
    this.state.status = "running";
    this.state.runningTool = {
      toolName,
      startedAt: Date.now(),
      streamLines: [],
    };
  }

  public appendToolOutput(chunk: string): void {
    if (this.state.runningTool) {
      this.state.runningTool.streamLines.push(chunk);
      if (this.state.runningTool.streamLines.length > 50) {
        this.state.runningTool.streamLines.shift(); // Keep bounded output buffer
      }
    }
  }

  public finishToolExecution(status: "idle" | "error" = "idle"): void {
    this.state.status = status;
    this.state.runningTool = undefined;
  }

  public renderHeader(terminalWidth = 80): string {
    const title = " ANANTHAM V2 — OPERATING DASHBOARD ";
    const pad = Math.max(0, Math.floor((terminalWidth - title.length) / 2));
    const border = "=".repeat(terminalWidth);
    const centerLine = " ".repeat(pad) + title + " ".repeat(pad);
    return `${border}\n${centerLine}\n${border}`;
  }

  public renderStatusBar(terminalWidth = 80): string {
    const statusText = `STATUS: [${this.state.status.toUpperCase()}] | SESSION: ${this.state.sessionId} | MODEL: ${this.state.activeModel} | BRANCH: ${this.state.activeBranch}`;
    const costText = `TOKENS: ${this.state.tokenCount.toLocaleString()} | COST: $${this.state.costUsd.toFixed(4)}`;
    return `[ ${statusText.slice(0, terminalWidth - 4)} ]\n[ ${costText.slice(0, terminalWidth - 4)} ]`;
  }

  public renderToolMonitor(maxLines = 5): string {
    if (!this.state.runningTool) {
      return "Tool Monitor: Idle (No active tool executing)";
    }

    const elapsed = Math.round((Date.now() - this.state.runningTool.startedAt) / 1000);
    const header = `Active Tool: [${this.state.runningTool.toolName}] (Running: ${elapsed}s)`;
    const recentLines = this.state.runningTool.streamLines.slice(-maxLines);
    const output = recentLines.length > 0 ? recentLines.map((l) => `  > ${l}`).join("\n") : "  > (waiting for output...)";

    return `${header}\n${output}`;
  }

  public renderFullView(terminalWidth = 80): string {
    return [
      this.renderHeader(terminalWidth),
      this.renderStatusBar(terminalWidth),
      "-".repeat(terminalWidth),
      this.renderToolMonitor(),
      "=".repeat(terminalWidth),
    ].join("\n");
  }
}
