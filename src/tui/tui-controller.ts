import { type Writable } from "node:stream";
import { type TuiViewMode } from "../domain/tui.js";
import { type TuiStateAdapter } from "./tui-state-adapter.js";
import { type TuiRenderer } from "./tui-renderer.js";
import { type CommandRegistry } from "../cli/command-registry.js";
import { type CommandParser } from "../cli/command-parser.js";
import { type CliErrorHandler } from "../cli/error-handler.js";

export interface TuiControllerOptions {
  stateAdapter: TuiStateAdapter;
  renderer: TuiRenderer;
  commandRegistry?: CommandRegistry;
  commandParser?: CommandParser;
  errorHandler?: CliErrorHandler;
  output?: Writable;
  coalesceIntervalMs?: number;
}

/**
 * TUI Controller: Manages navigation, keyboard input, command execution, and render coalescing.
 * PRD Part 2 Section 188–195.
 */
export class TuiController {
  private readonly stateAdapter: TuiStateAdapter;
  private readonly renderer: TuiRenderer;
  private readonly commandRegistry?: CommandRegistry;
  private readonly commandParser?: CommandParser;
  private readonly errorHandler?: CliErrorHandler;
  private readonly output: Writable;
  private readonly coalesceIntervalMs: number;

  private currentView: TuiViewMode = "dashboard";
  private isCommandMode = false;
  private commandBuffer = "";
  private errorMessage = "";
  private isRunning = false;
  private renderTimeout?: NodeJS.Timeout;
  private unregisterStateListener?: () => void;

  constructor(options: TuiControllerOptions) {
    this.stateAdapter = options.stateAdapter;
    this.renderer = options.renderer;
    this.commandRegistry = options.commandRegistry;
    this.commandParser = options.commandParser;
    this.errorHandler = options.errorHandler;
    this.output = options.output ?? process.stdout;
    this.coalesceIntervalMs = options.coalesceIntervalMs ?? 30;

    this.attachStateListener();
  }

  private attachStateListener(): void {
    this.unregisterStateListener = this.stateAdapter.subscribe(() => {
      this.requestRender();
    });
  }

  public getCurrentView(): TuiViewMode {
    return this.currentView;
  }

  public setView(view: TuiViewMode): void {
    this.currentView = view;
    this.requestRender();
  }

  public start(): void {
    this.isRunning = true;
    this.renderNow();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = undefined;
    }
    if (this.unregisterStateListener) {
      this.unregisterStateListener();
      this.unregisterStateListener = undefined;
    }
  }

  /**
   * Request a coalesced render frame to prevent event storms.
   */
  public requestRender(): void {
    if (!this.isRunning) return;

    if (!this.renderTimeout) {
      this.renderTimeout = setTimeout(() => {
        this.renderTimeout = undefined;
        this.renderNow();
      }, this.coalesceIntervalMs);
    }
  }

  /**
   * Render immediately to output stream.
   */
  public renderNow(): void {
    const rendered = this.renderer.render(
      this.currentView,
      this.stateAdapter,
      this.isCommandMode ? this.commandBuffer : "",
      this.errorMessage
    );

    // Clear screen and redraw
    this.output.write("\x1b[2J\x1b[H" + rendered + "\n");
  }

  /**
   * Handle raw keyboard / character input.
   */
  public async handleInput(char: string): Promise<boolean> {
    this.errorMessage = "";

    if (this.isCommandMode) {
      if (char === "\r" || char === "\n") {
        // Submit command
        const toExec = this.commandBuffer.trim();
        this.isCommandMode = false;
        this.commandBuffer = "";

        if (toExec) {
          await this.executeCommand(toExec);
        }
        this.requestRender();
        return true;
      }

      if (char === "\u001B" || char === "\u0003") {
        // Cancel command mode (ESC or Ctrl+C)
        this.isCommandMode = false;
        this.commandBuffer = "";
        this.requestRender();
        return true;
      }

      if (char === "\u007F" || char === "\b") {
        // Backspace
        this.commandBuffer = this.commandBuffer.slice(0, -1);
        this.requestRender();
        return true;
      }

      // Append character
      this.commandBuffer += char;
      this.requestRender();
      return true;
    }

    // Normal navigation mode
    switch (char) {
      case "1":
        this.setView("dashboard");
        return true;
      case "2":
        this.setView("session");
        return true;
      case "3":
        this.setView("tasks");
        return true;
      case "4":
        this.setView("workflows");
        return true;
      case "5":
        this.setView("agents");
        return true;
      case "6":
        this.setView("jobs");
        return true;
      case "7":
        this.setView("nodes");
        return true;
      case "8":
        this.setView("approvals");
        return true;
      case "9":
        this.setView("events");
        return true;
      case "?":
      case "h":
        this.setView("help");
        return true;
      case "/":
        this.isCommandMode = true;
        this.commandBuffer = "";
        this.requestRender();
        return true;
      case "r":
        this.requestRender();
        return true;
      case "q":
      case "\u001B": // ESC
        this.stop();
        return false;
    }

    return true;
  }

  /**
   * Bridge slash command to authoritative CommandRegistry.
   */
  public async executeCommand(rawCommand: string): Promise<void> {
    if (!this.commandRegistry || !this.commandParser) {
      this.errorMessage = "Command execution bridge unavailable.";
      return;
    }

    try {
      const parsed = this.commandParser.parse(rawCommand.startsWith("/") ? rawCommand : `/${rawCommand}`);
      const result = await this.commandRegistry.execute(parsed);

      if (!result.success) {
        this.errorMessage = result.error ?? "Command failed.";
      }

      if (result.exitRequested) {
        this.stop();
      }
    } catch (err) {
      if (this.errorHandler) {
        const handled = this.errorHandler.handleError("tui", err);
        this.errorMessage = handled.error ?? "Command error.";
      } else {
        this.errorMessage = err instanceof Error ? err.message : String(err);
      }
    }
  }
}
