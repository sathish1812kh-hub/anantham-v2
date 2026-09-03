/**
 * Interactive Shell Loop & Multi-Line REPL Engine
 * PRD-CLI-002: Interactive Shell Loop
 * PRD-CLI-005: Multi-Line Input & Advanced Editor Integration
 */

export interface ShellCommandResult {
  command: string;
  args: string[];
  isSlashCommand: boolean;
  output?: string;
  exitShell?: boolean;
}

export class InteractiveShellEngine {
  private history: string[] = [];
  private historyIndex = -1;
  private multiLineBuffer: string[] = [];
  private multiLineMode: "quotes" | "backslash" | "none" = "none";

  public getHistory(): string[] {
    return [...this.history];
  }

  public addToHistory(input: string): void {
    const trimmed = input.trim();
    if (trimmed.length > 0 && (this.history.length === 0 || this.history[this.history.length - 1] !== trimmed)) {
      this.history.push(trimmed);
    }
    this.historyIndex = this.history.length;
  }

  public navigateHistory(direction: "up" | "down"): string | null {
    if (this.history.length === 0) return null;

    if (direction === "up") {
      if (this.historyIndex > 0) {
        this.historyIndex--;
      }
      return this.history[this.historyIndex] ?? null;
    } else {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        return this.history[this.historyIndex] ?? null;
      }
      this.historyIndex = this.history.length;
      return "";
    }
  }

  public processInputLine(line: string): { completed: boolean; fullInput?: string } {
    // 1. Not in multi-line mode yet
    if (this.multiLineMode === "none") {
      if (line.startsWith('"""') || line.startsWith("'''")) {
        this.multiLineMode = "quotes";
        this.multiLineBuffer = [line.slice(3)];
        return { completed: false };
      }
      if (line.endsWith("\\")) {
        this.multiLineMode = "backslash";
        this.multiLineBuffer = [line.slice(0, -1)];
        return { completed: false };
      }

      this.addToHistory(line);
      return { completed: true, fullInput: line };
    }

    // 2. In triple-quotes multi-line mode
    if (this.multiLineMode === "quotes") {
      if (line.endsWith('"""') || line.endsWith("'''")) {
        this.multiLineMode = "none";
        this.multiLineBuffer.push(line.slice(0, -3));
        const assembled = this.multiLineBuffer.join("\n");
        this.multiLineBuffer = [];
        this.addToHistory(assembled);
        return { completed: true, fullInput: assembled };
      }

      this.multiLineBuffer.push(line);
      return { completed: false };
    }

    // 3. In backslash continuation mode
    if (this.multiLineMode === "backslash") {
      if (line.endsWith("\\")) {
        this.multiLineBuffer.push(line.slice(0, -1));
        return { completed: false };
      } else {
        this.multiLineMode = "none";
        this.multiLineBuffer.push(line);
        const assembled = this.multiLineBuffer.join("\n");
        this.multiLineBuffer = [];
        this.addToHistory(assembled);
        return { completed: true, fullInput: assembled };
      }
    }

    return { completed: false };
  }

  public parseCommand(input: string): ShellCommandResult {
    const trimmed = input.trim();
    if (trimmed === "exit" || trimmed === "quit") {
      return { command: "exit", args: [], isSlashCommand: false, exitShell: true };
    }

    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(/\s+/);
      const command = parts[0]!.toLowerCase();
      const args = parts.slice(1);
      return { command, args, isSlashCommand: true };
    }

    return { command: "prompt", args: [trimmed], isSlashCommand: false };
  }
}
