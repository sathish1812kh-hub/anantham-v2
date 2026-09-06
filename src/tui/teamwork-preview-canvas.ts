/**
 * Anantham V2 — Multi-Agent ASCII Orchestration Topology Canvas.
 * Renders rich ASCII multi-agent orchestration topology (/teamwork-preview)
 * for interactive TUI viewports and headless CLI execution.
 */

import { AnsiGradient } from "./ansi-gradient.js";
import { TuiSanitizer } from "./tui-sanitizer.js";

export type AgentState = "IDLE" | "PLANNING" | "EXECUTING";

export interface AgentTopologyNode {
  id: string;
  name: string;
  role: string;
  state: AgentState;
  worktree?: string;
}

export interface OrchestrationMetricsData {
  workersCount: number;
  fencingToken: string;
  epoch: number;
  depthWaves: number;
  leaseHeld: string;
  ttlRemaining: string;
  heartbeatAgo: string;
  worktrees: string[];
  durability?: string;
  security?: string;
}

export interface CanvasRenderOptions {
  ansi?: boolean;
  nodes?: AgentTopologyNode[];
  metrics?: Partial<OrchestrationMetricsData>;
}

export class TeamworkPreviewCanvas {
  public static readonly DEFAULT_NODES: AgentTopologyNode[] = [
    {
      id: "architect",
      name: "ARCHITECT",
      role: "Wave Plan",
      state: "PLANNING",
      worktree: "/wt/architect",
    },
    {
      id: "coder",
      name: "CODER",
      role: "Coder",
      state: "EXECUTING",
      worktree: "/wt/coder-1, 2",
    },
    {
      id: "reviewer",
      name: "REVIEWER",
      role: "Gate Audits",
      state: "IDLE",
      worktree: "/wt/reviewer",
    },
    {
      id: "sre",
      name: "SRE / AUDITOR",
      role: "ToolGW/RPO-0",
      state: "IDLE",
      worktree: "/wt/sre",
    },
  ];

  public static readonly DEFAULT_METRICS: OrchestrationMetricsData = {
    workersCount: 4,
    fencingToken: "0x04F2",
    epoch: 14,
    depthWaves: 3,
    leaseHeld: "4/4 held",
    ttlRemaining: "284s / 300s",
    heartbeatAgo: "1.2s ago",
    worktrees: ["/wt/architect", "/wt/coder-1", "/wt/coder-2", "/wt/sre"],
    durability: "SQLite WAL (synchronous = FULL, RPO-0)",
    security: "ToolGateway sandboxed",
  };

  /**
   * Format active state pill with TrueColor or clean plain-text fallback.
   * - IDLE: Emerald (\x1b[38;2;0;242;152m)
   * - PLANNING: Amber (\x1b[38;2;255;154;60m)
   * - EXECUTING: Cyan (\x1b[38;2;0;242;254m)
   */
  public static formatPill(state: AgentState, ansi: boolean = true): string {
    switch (state) {
      case "IDLE":
        return ansi ? "\x1b[38;2;0;242;152m● [IDLE]\x1b[0m" : "● [IDLE]";
      case "PLANNING":
        return ansi ? "\x1b[38;2;255;154;60m▲ [PLANNING]\x1b[0m" : "▲ [PLANNING]";
      case "EXECUTING":
        return ansi ? "\x1b[38;2;0;242;254m⚡ [EXECUTING]\x1b[0m" : "⚡ [EXECUTING]";
      default:
        return `[${state}]`;
    }
  }

  /**
   * Render lines formatted for TUI viewport.
   * Standard 2-column topology fits in 78 columns and <= 17 rows.
   * When width < 76, switches adaptively to a single-column vertical pipeline.
   */
  public static render(
    width: number = 80,
    _height: number = 24,
    options?: CanvasRenderOptions
  ): string[] {
    const isAnsi = options?.ansi ?? AnsiGradient.isTrueColorSupported();

    if (width < 76) {
      return this.renderVerticalPipeline(width, { ...options, ansi: isAnsi });
    }

    return this.renderGridTopology({ ...options, ansi: isAnsi });
  }

  /**
   * Render multi-line string preserving the two test anchors:
   * - "❖ Teamwork Preview Harness Status: ONLINE"
   * - "Parallel Workers : 4"
   * for backward compatibility with existing integration tests and headless CLI execution.
   */
  public static renderText(options?: CanvasRenderOptions): string {
    const isAnsi = options?.ansi ?? AnsiGradient.isTrueColorSupported();
    const canvasLines = this.render(80, 24, { ...options, ansi: isAnsi });

    const lines: string[] = [
      "❖ Teamwork Preview Harness Status: ONLINE",
      "  Engine           : Anantham V2 Autonomous Agent Coordinator",
      "  Parallel Workers : 4 active worker execution slots",
      "  Task Partitioning: Wave DAG with generation-fenced leases",
      "  Durability       : SQLite WAL (synchronous = FULL, RPO-0)",
      "  Safety Boundary  : ToolGateway sandboxed capability routing",
      "",
      ...canvasLines,
      "",
      "Autonomous team preview ready. Submit prompt tasks via interactive CLI or TUI.",
    ];

    return lines.join("\n");
  }

  /**
   * 78-column, 16-row 2-column grid multi-agent topology.
   */
  private static renderGridTopology(options?: CanvasRenderOptions): string[] {
    const ansi = options?.ansi ?? false;
    const nodes = options?.nodes ?? this.DEFAULT_NODES;
    const metrics: OrchestrationMetricsData = {
      ...this.DEFAULT_METRICS,
      ...(options?.metrics ?? {}),
    };

    const architect = nodes.find((n) => n.id === "architect") ?? this.DEFAULT_NODES[0]!;
    const coder = nodes.find((n) => n.id === "coder") ?? this.DEFAULT_NODES[1]!;
    const reviewer = nodes.find((n) => n.id === "reviewer") ?? this.DEFAULT_NODES[2]!;
    const sre = nodes.find((n) => n.id === "sre") ?? this.DEFAULT_NODES[3]!;

    // Color tokens
    const cCyan = ansi ? "\x1b[38;2;0;242;254m" : "";
    const cAmber = ansi ? "\x1b[38;2;255;154;60m" : "";
    const cEmerald = ansi ? "\x1b[38;2;0;242;152m" : "";
    const cDim = ansi ? "\x1b[90m" : "";
    const cBold = ansi ? "\x1b[1m" : "";
    const cReset = ansi ? "\x1b[0m" : "";

    const pillArch = this.formatPill(architect.state, ansi);
    const pillCoder = this.formatPill(coder.state, ansi);
    const pillRev = this.formatPill(reviewer.state, ansi);
    const pillSre = this.formatPill(sre.state, ansi);

    const lines: string[] = [];

    // Helper to wrap 74 visible chars into a 78-char row
    const row = (styledContent: string, plainLen: number): string => {
      const pad = Math.max(0, 74 - plainLen);
      return `${cCyan}│${cReset} ${styledContent}${" ".repeat(pad)} ${cCyan}│${cReset}`;
    };

    // Row 1: Outer Header (78 chars)
    // "╭─" (2) + " ❖ MULTI-AGENT ORCHESTRATION TOPOLOGY " (38) + "─".repeat(37) (37) + "╮" (1) = 78
    const titleText = " ❖ MULTI-AGENT ORCHESTRATION TOPOLOGY ";
    const dashesTop = "─".repeat(37);
    lines.push(`${cCyan}╭─${cBold}${titleText}${cReset}${cCyan}${dashesTop}╮${cReset}`);

    // Row 2: Top Box Top Borders & Wave DAG Delegation Corridor
    // Left: ┌─[ ARCHITECT ]──────────┐ (26)
    // Middle:  ── Wave DAG Del ──►   (22)
    // Right: ┌─[ CODER ]──────────────┐ (26)
    // Total = 26 + 22 + 26 = 74
    const topArchBox = `${cAmber}┌─[ ARCHITECT ]──────────┐${cReset}`;
    const topCoderBox = `${cCyan}┌─[ CODER ]──────────────┐${cReset}`;
    const midWaveDag = `${cDim} ── Wave DAG Del ──►  ${cReset}`;
    lines.push(row(`${topArchBox}${midWaveDag}${topCoderBox}`, 74));

    // Row 3: State Pills & Task Contracts Corridor
    // Inside Arch (24): " ▲ [PLANNING] Wave Plan " -> 1 + 12 + 1 + 9 + 1 = 24
    // Inside Coder (24): " ⚡ [EXECUTING] Coder    " -> 1 + 13 + 1 + 5 + 4 = 24
    // Middle (22): " ◄── Task Contracts   " (22)
    const row3ArchInside = ` ${pillArch} ${architect.role.padEnd(9)} `;
    const row3CoderInside = ` ${pillCoder} ${coder.role.padEnd(5)}    `;
    const midTaskContracts = `${cDim} ◄── Task Contracts   ${cReset}`;
    lines.push(
      row(
        `${cAmber}│${cReset}${row3ArchInside}${cAmber}│${cReset}${midTaskContracts}${cCyan}│${cReset}${row3CoderInside}${cCyan}│${cReset}`,
        74
      )
    );

    // Row 4: Worktrees
    // Inside Arch (24): " Tree: /wt/architect    " (7 + 16 + 1 = 24)
    // Inside Coder (24): " Tree: /wt/coder-1, 2   " (7 + 16 + 1 = 24)
    // Middle (22): 22 spaces
    const treeArch = ` Tree: ${(architect.worktree ?? "/wt/architect").padEnd(16)} `;
    const treeCoder = ` Tree: ${(coder.worktree ?? "/wt/coder-1, 2").padEnd(16)} `;
    const midSpace22 = " ".repeat(22);
    lines.push(
      row(
        `${cAmber}│${cReset}${cDim}${treeArch}${cReset}${cAmber}│${cReset}${midSpace22}${cCyan}│${cReset}${cDim}${treeCoder}${cReset}${cCyan}│${cReset}`,
        74
      )
    );

    // Row 5: Top Box Bottom Borders (74)
    const botArchBox = `${cAmber}└────────────────────────┘${cReset}`;
    const botCoderBox = `${cCyan}└────────────────────────┘${cReset}`;
    lines.push(row(`${botArchBox}${midSpace22}${botCoderBox}`, 74));

    // Row 6: Vertical Routing Paths (74)
    // Left (26): "  ▲ Health & Fencing Token" (26)
    // Mid (22): 22 spaces
    // Right (26): "   Code Diffs ▼ Critique ▲" (26)
    const routeLeft = `${cEmerald}  ▲ Health & Fencing Token${cReset}`;
    const routeRight = `${cCyan}   Code Diffs ${cReset}${cDim}▼${cReset}${cAmber} Critique ▲${cReset}`;
    lines.push(row(`${routeLeft}${midSpace22}${routeRight}`, 74));

    // Row 7: Bottom Box Top Borders (74)
    // Left: ┌─[ SRE / AUDITOR ]──────┐ (26)
    // Right: ┌─[ REVIEWER ]───────────┐ (26)
    const topSreBox = `${cEmerald}┌─[ SRE / AUDITOR ]──────┐${cReset}`;
    const topRevBox = `${cAmber}┌─[ REVIEWER ]───────────┐${cReset}`;
    lines.push(row(`${topSreBox}${midSpace22}${topRevBox}`, 74));

    // Row 8: Bottom State Pills & Verified Checkpoint Corridor (74)
    // Inside SRE (24): " ● [IDLE] ToolGW/RPO-0  " (24)
    // Middle (22): " ◄── Verified Chkpt   " (22)
    // Inside Rev (24): " ● [IDLE] Gate Audits   " (24)
    const row8SreInside = ` ${pillSre} ${sre.role.padEnd(12)}  `;
    const midVerified = `${cDim} ◄── Verified Chkpt   ${cReset}`;
    const row8RevInside = ` ${pillRev} ${reviewer.role.padEnd(11)}   `;
    lines.push(
      row(
        `${cEmerald}│${cReset}${row8SreInside}${cEmerald}│${cReset}${midVerified}${cAmber}│${cReset}${row8RevInside}${cAmber}│${cReset}`,
        74
      )
    );

    // Row 9: Worktrees & Policy Gates Corridor (74)
    // Inside SRE (24): " Tree: /wt/sre          " (7 + 16 + 1 = 24)
    // Middle (22): " ── Policy Gates ──►  " (22)
    // Inside Rev (24): " Tree: /wt/reviewer     " (7 + 16 + 1 = 24)
    const treeSre = ` Tree: ${(sre.worktree ?? "/wt/sre").padEnd(16)} `;
    const midPolicy = `${cDim} ── Policy Gates ──►  ${cReset}`;
    const treeRev = ` Tree: ${(reviewer.worktree ?? "/wt/reviewer").padEnd(16)} `;
    lines.push(
      row(
        `${cEmerald}│${cReset}${cDim}${treeSre}${cReset}${cEmerald}│${cReset}${midPolicy}${cAmber}│${cReset}${cDim}${treeRev}${cReset}${cAmber}│${cReset}`,
        74
      )
    );

    // Row 10: Bottom Box Bottom Borders (74)
    const botSreBox = `${cEmerald}└────────────────────────┘${cReset}`;
    const botRevBox = `${cAmber}└────────────────────────┘${cReset}`;
    lines.push(row(`${botSreBox}${midSpace22}${botRevBox}`, 74));

    // Row 11: Summary Metrics Divider (78 chars)
    // "├─" (2) + " SUMMARY METRICS " (17) + "─".repeat(58) (58) + "┤" (1) = 78
    const dashMetrics = "─".repeat(58);
    lines.push(`${cCyan}├─${cBold} SUMMARY METRICS ${cReset}${cCyan}${dashMetrics}┤${cReset}`);

    // Row 12: Worktrees Metric (78 chars)
    const wtStr = metrics.worktrees.join(", ");
    const m1Text = `Worktrees : ${metrics.workersCount} active [${wtStr}]`;
    const m1Plain = m1Text.length > 74 ? m1Text.slice(0, 74) : m1Text;
    lines.push(row(`${cBold}${m1Plain}${cReset}`, m1Plain.length));

    // Row 13: Wave DAG Fencing Metric (78 chars)
    const m2Text = `Wave DAG  : Token #${metrics.fencingToken} (Fence: ACTIVE | Epoch: ${metrics.epoch} | Depth: ${metrics.depthWaves} waves)`;
    const m2Plain = m2Text.length > 74 ? m2Text.slice(0, 74) : m2Text;
    lines.push(row(`${cDim}${m2Plain}${cReset}`, m2Plain.length));

    // Row 14: Lease Durations Metric (78 chars)
    const m3Text = `Leases    : ${metrics.leaseHeld} (TTL: ${metrics.ttlRemaining} | Heartbeat: ${metrics.heartbeatAgo} | Drift: 0ms)`;
    const m3Plain = m3Text.length > 74 ? m3Text.slice(0, 74) : m3Text;
    lines.push(row(`${cDim}${m3Plain}${cReset}`, m3Plain.length));

    // Row 15: Durability & Security Metric (78 chars)
    const m4Text = `Durability: ${metrics.durability ?? "SQLite WAL (synchronous = FULL, RPO-0)"} | ${metrics.security ?? "ToolGateway sandboxed"}`;
    const m4Plain = m4Text.length > 74 ? m4Text.slice(0, 74) : m4Text;
    lines.push(row(`${cDim}${m4Plain}${cReset}`, m4Plain.length));

    // Row 16: Bottom Border (78 chars)
    // "╰" (1) + "─".repeat(76) (76) + "╯" (1) = 78
    const botDash = "─".repeat(76);
    lines.push(`${cCyan}╰${botDash}╯${cReset}`);

    return lines;
  }

  /**
   * Vertical pipeline topology when viewport width < 76 columns.
   */
  private static renderVerticalPipeline(
    width: number,
    options?: CanvasRenderOptions
  ): string[] {
    const ansi = options?.ansi ?? false;
    const nodes = options?.nodes ?? this.DEFAULT_NODES;
    const metrics: OrchestrationMetricsData = {
      ...this.DEFAULT_METRICS,
      ...(options?.metrics ?? {}),
    };

    const cCyan = ansi ? "\x1b[38;2;0;242;254m" : "";
    const cAmber = ansi ? "\x1b[38;2;255;154;60m" : "";
    const cEmerald = ansi ? "\x1b[38;2;0;242;152m" : "";
    const cDim = ansi ? "\x1b[90m" : "";
    const cBold = ansi ? "\x1b[1m" : "";
    const cReset = ansi ? "\x1b[0m" : "";

    const boxW = Math.max(30, Math.min(width - 2, 42));
    const innerW = boxW - 2;

    const lines: string[] = [];
    lines.push(`${cCyan}╭─${cBold} TOPOLOGY PIPELINE ${cReset}${cCyan}${"─".repeat(Math.max(0, boxW - 21))}╮${cReset}`);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const pill = this.formatPill(node.state, ansi);
      const color =
        node.id === "architect" ? cAmber : node.id === "coder" ? cCyan : cEmerald;

      // Node Box Header
      const headTitle = `[ ${node.name} ]`;
      const padHead = Math.max(0, innerW - headTitle.length - 2);
      lines.push(`${color}┌─${cBold}${headTitle}${cReset}${color}${"─".repeat(padHead)}┐${cReset}`);

      // Node Box Body
      const stateLine = ` State: ${pill}`;
      const cleanStateLen = TuiSanitizer.stripAnsi(stateLine).length;
      lines.push(
        `${color}│${cReset}${stateLine}${" ".repeat(Math.max(0, innerW - cleanStateLen))}${color}│${cReset}`
      );

      const roleLine = ` Role : ${node.role}`;
      lines.push(
        `${color}│${cReset}${roleLine.padEnd(innerW)}${color}│${cReset}`
      );

      if (node.worktree) {
        const wtLine = ` Tree : ${node.worktree}`;
        lines.push(
          `${color}│${cReset}${cDim}${wtLine.padEnd(innerW)}${cReset}${color}│${cReset}`
        );
      }

      // Route transition to next node
      if (i < nodes.length - 1) {
        lines.push(`${color}└─────────────┬───────────┘${cReset}`);
        const routeLabel =
          i === 0
            ? "Wave DAG Delegation ──►"
            : i === 1
              ? "Code Diffs / Review ──►"
              : "Verified Checkpoint ──►";
        lines.push(`${cDim}              │ ${routeLabel}${cReset}`);
        lines.push(`${cDim}              ▼${cReset}`);
      } else {
        lines.push(`${color}└─────────────────────────┘${cReset}`);
      }
    }

    // Compact Summary Metrics
    lines.push(`${cCyan}├─${cBold} METRICS ${cReset}${cCyan}${"─".repeat(Math.max(0, boxW - 11))}┤${cReset}`);
    const m1 = ` Workers: ${metrics.workersCount} active | Token #${metrics.fencingToken}`;
    const m1Clean = m1.length > innerW ? m1.slice(0, innerW) : m1.padEnd(innerW);
    lines.push(`${cCyan}│${cReset}${m1Clean}${cCyan}│${cReset}`);

    const m2 = ` Leases : ${metrics.leaseHeld} (TTL: ${metrics.ttlRemaining})`;
    const m2Clean = m2.length > innerW ? m2.slice(0, innerW) : m2.padEnd(innerW);
    lines.push(`${cCyan}│${cReset}${m2Clean}${cCyan}│${cReset}`);

    lines.push(`${cCyan}╰${"─".repeat(boxW - 2)}╯${cReset}`);

    return lines;
  }
}
