import { AnsiGradient } from "./ansi-gradient.js";

export interface PaletteCommand {
  id: string;
  command: string;
  label: string;
  description: string;
  shortcut?: string;
  category: "system" | "views" | "models" | "analytics";
}

export class CommandPalette {
  public static readonly COMMANDS: PaletteCommand[] = [
    {
      id: "teamwork-preview",
      command: "/teamwork-preview",
      label: "Teamwork Preview",
      description: "Launch autonomous multi-worker preview harness",
      shortcut: "Alt+T",
      category: "analytics",
    },
    {
      id: "usage",
      command: "/usage",
      label: "Token Usage Matrix",
      description: "Real-time token analytics & financial cost dashboard",
      shortcut: "Alt+U",
      category: "analytics",
    },
    {
      id: "models",
      command: "/models",
      label: "Model Management",
      description: "View, switch, add and live-search AI models",
      shortcut: "Alt+M",
      category: "models",
    },
    {
      id: "model-1",
      command: "/model 1",
      label: "Select Model 1",
      description: "Fast-switch to Claude 3.5 Sonnet",
      shortcut: "1",
      category: "models",
    },
    {
      id: "model-2",
      command: "/model 2",
      label: "Select Model 2",
      description: "Fast-switch to GPT-4o",
      shortcut: "2",
      category: "models",
    },
    {
      id: "model-3",
      command: "/model 3",
      label: "Select Model 3",
      description: "Fast-switch to DeepSeek V3",
      shortcut: "3",
      category: "models",
    },
    {
      id: "key",
      command: "/key",
      label: "Provider API Keys",
      description: "Configure OpenRouter, OpenAI, Anthropic, Gemini keys",
      shortcut: "Alt+K",
      category: "system",
    },
    {
      id: "status",
      command: "/status",
      label: "System Status",
      description: "Display engine latency, health and recovery state",
      shortcut: "Alt+S",
      category: "system",
    },
    {
      id: "clear",
      command: "/clear",
      label: "Clear Viewport",
      description: "Clear command result buffer and reset screen",
      shortcut: "Ctrl+L",
      category: "system",
    },
    {
      id: "dashboard",
      command: "/dashboard",
      label: "Dashboard View",
      description: "Switch to System Overview dashboard",
      shortcut: "1",
      category: "views",
    },
    {
      id: "session",
      command: "/session",
      label: "Session View",
      description: "Switch to Session & context inspection",
      shortcut: "2",
      category: "views",
    },
    {
      id: "tasks",
      command: "/tasks",
      label: "Tasks DAG",
      description: "Switch to Task dependency & execution graph",
      shortcut: "3",
      category: "views",
    },
    {
      id: "workflows",
      command: "/workflows",
      label: "Workflows",
      description: "Switch to Wave DAG workflow orchestration",
      shortcut: "4",
      category: "views",
    },
    {
      id: "agents",
      command: "/agents",
      label: "Agent Roster",
      description: "Switch to Active agent & subagent roster",
      shortcut: "5",
      category: "views",
    },
    {
      id: "jobs",
      command: "/jobs",
      label: "Background Jobs",
      description: "Switch to Detached background jobs pool",
      shortcut: "6",
      category: "views",
    },
    {
      id: "nodes",
      command: "/nodes",
      label: "Remote Nodes",
      description: "Switch to Distributed remote execution nodes",
      shortcut: "7",
      category: "views",
    },
    {
      id: "approvals",
      command: "/approvals",
      label: "Approvals",
      description: "Switch to Human-in-the-loop approval gates",
      shortcut: "8",
      category: "views",
    },
    {
      id: "events",
      command: "/events",
      label: "Event Stream",
      description: "Switch to Real-time immutable event log",
      shortcut: "9",
      category: "views",
    },
    {
      id: "help",
      command: "/help",
      label: "Help & Shortcuts",
      description: "Display command index and keyboard navigation",
      shortcut: "?",
      category: "system",
    },
    {
      id: "quit",
      command: "/quit",
      label: "Quit Shell",
      description: "Cleanly terminate the interactive TUI shell",
      shortcut: "q",
      category: "system",
    },
  ];

  /**
   * Filter available commands based on query string.
   */
  public static filterCommands(query: string): PaletteCommand[] {
    const raw = query.trim().toLowerCase();
    const cleanQuery = raw.startsWith("/") ? raw : `/${raw}`;

    if (cleanQuery === "/") {
      return [...CommandPalette.COMMANDS];
    }

    return CommandPalette.COMMANDS.filter((item) => {
      const matchCmd = item.command.toLowerCase().includes(cleanQuery);
      const matchLabel = item.label.toLowerCase().includes(raw.replace(/^\//, ""));
      const matchDesc = item.description.toLowerCase().includes(raw.replace(/^\//, ""));
      return matchCmd || matchLabel || matchDesc;
    });
  }

  /**
   * Render popover overlay box above the command input field.
   */
  public static renderOverlay(
    filtered: PaletteCommand[],
    selectedIndex: number,
    width: number = 78,
    maxVisible: number = 7
  ): string[] {
    const lines: string[] = [];
    const innerWidth = Math.max(40, width - 4);

    const titleText = " ❖ COMMAND PALETTE ";
    const titleGrad = AnsiGradient.linearGradient(
      titleText,
      AnsiGradient.PALETTES.cyanBlue[0],
      AnsiGradient.PALETTES.cyanBlue[1]
    );
    const borderCyan = "\x1b[38;2;0;242;254m";
    const borderDim = "\x1b[38;2;60;60;80m";
    const reset = "\x1b[0m";

    // Top border
    const padLen = Math.max(0, innerWidth - titleText.length - 2);
    lines.push(
      `${borderCyan}╭─${reset}${titleGrad}${borderCyan}${"─".repeat(padLen)}╮${reset}`
    );

    if (filtered.length === 0) {
      const emptyMsg = "  (No matching commands found)";
      const pad = " ".repeat(Math.max(0, innerWidth - emptyMsg.length));
      lines.push(`${borderCyan}│${reset}\x1b[90m${emptyMsg}${pad}${reset}${borderCyan}│${reset}`);
    } else {
      // Calculate window of visible items
      const total = filtered.length;
      const safeSelected = Math.max(0, Math.min(selectedIndex, total - 1));
      let startIdx = 0;
      if (safeSelected >= maxVisible) {
        startIdx = safeSelected - maxVisible + 1;
      }
      const endIdx = Math.min(total, startIdx + maxVisible);

      for (let i = startIdx; i < endIdx; i++) {
        const item = filtered[i];
        if (!item) continue;
        const isSelected = i === safeSelected;

        const cmdPart = item.command.padEnd(20);
        const descPart = item.description;
        const shortcutPart = item.shortcut ? ` [${item.shortcut}]` : "";

        const availableDescWidth = Math.max(
          10,
          innerWidth - cmdPart.length - shortcutPart.length - 6
        );
        const truncatedDesc =
          descPart.length > availableDescWidth
            ? `${descPart.slice(0, availableDescWidth - 3)}...`
            : descPart;

        const contentRaw = ` ${isSelected ? "▶" : " "} ${cmdPart} ${truncatedDesc}${shortcutPart} `;
        const totalPad = Math.max(0, innerWidth - contentRaw.length);

        if (isSelected) {
          // Highlight with cyan background and bold text
          const styledLine = `\x1b[48;2;16;38;56m\x1b[1m\x1b[38;2;0;242;254m ${"▶"} ${cmdPart}\x1b[38;2;220;235;255m ${truncatedDesc}\x1b[38;2;140;180;220m${shortcutPart} ${" ".repeat(totalPad)}${reset}`;
          lines.push(`${borderCyan}│${reset}${styledLine}${borderCyan}│${reset}`);
        } else {
          const styledLine = `   \x1b[38;2;79;172;254m${cmdPart}\x1b[38;2;160;160;180m ${truncatedDesc}\x1b[90m${shortcutPart} ${" ".repeat(totalPad)}${reset}`;
          lines.push(`${borderDim}│${reset}${styledLine}${borderDim}│${reset}`);
        }
      }
    }

    // Bottom hints border
    const hintText = " [↑/↓] Navigate  [Tab] Complete  [Enter] Execute  [Esc] Close ";
    const hintPad = Math.max(0, innerWidth - hintText.length);
    lines.push(
      `${borderCyan}╰─${reset}\x1b[90m${hintText}${"─".repeat(hintPad)}${reset}${borderCyan}╯${reset}`
    );

    return lines;
  }
}
