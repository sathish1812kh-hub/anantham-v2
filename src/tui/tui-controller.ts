import { type Writable } from "node:stream";
import { type TuiDimensions, type TuiViewMode } from "../domain/tui.js";
import { type TuiStateAdapter } from "./tui-state-adapter.js";
import { type TuiRenderer } from "./tui-renderer.js";
import { type CommandRegistry } from "../cli/command-registry.js";
import { type CommandParser } from "../cli/command-parser.js";
import { type CliErrorHandler } from "../cli/error-handler.js";
import { CommandPalette, type PaletteCommand } from "./command-palette.js";
import { UserConfigManager } from "../persistence/user-config-manager.js";
import { ModelAccordionBrowser } from "./model-accordion-browser.js";
import { ModelCatalogCache } from "../persistence/model-catalog-cache.js";

export interface TuiControllerOptions {
  stateAdapter: TuiStateAdapter;
  renderer: TuiRenderer;
  commandRegistry?: CommandRegistry;
  commandParser?: CommandParser;
  errorHandler?: CliErrorHandler;
  output?: Writable;
  coalesceIntervalMs?: number;
  maxHistorySize?: number;
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
  private readonly maxHistorySize: number;

  private currentView: TuiViewMode = "dashboard";
  private isCommandMode = false;
  private commandBuffer = "";
  private errorMessage = "";
  private isRunning = false;
  private renderTimeout?: NodeJS.Timeout;
  private unregisterStateListener?: () => void;

  private commandHistory: string[] = [];
  private historyIndex = -1;
  private historyDraft = "";
  private savedDraft = "";
  private commandOutput: { title: string; lines: string[] } | null = null;
  private cursorPosition = 0;
  private isBracketedPaste = false;
  private paletteSelectedIndex = 0;
  private modelBrowserModal: ModelAccordionBrowser | null = null;

  constructor(options: TuiControllerOptions) {
    this.stateAdapter = options.stateAdapter;
    this.renderer = options.renderer;
    this.commandRegistry = options.commandRegistry;
    this.commandParser = options.commandParser;
    this.errorHandler = options.errorHandler;
    this.output = options.output ?? process.stdout;
    this.coalesceIntervalMs = options.coalesceIntervalMs ?? 30;
    this.maxHistorySize = options.maxHistorySize ?? 100;

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
    this.commandOutput = null;
    this.modelBrowserModal = null;
    this.requestRender();
  }

  public getModelBrowserModal(): ModelAccordionBrowser | null {
    return this.modelBrowserModal;
  }

  public setModelBrowserModal(modal: ModelAccordionBrowser | null): void {
    this.modelBrowserModal = modal;
    this.requestRender();
  }

  public getCommandOutput(): { title: string; lines: string[] } | null {
    return this.commandOutput;
  }

  public setCommandOutput(output: { title: string; lines: string[] } | null): void {
    this.commandOutput = output;
    this.requestRender();
  }

  public async openModelBrowserModal(): Promise<void> {
    const cache = ModelCatalogCache.getInstance();
    let models = cache.getCachedModels();
    if (!models || models.length === 0) {
      try {
        models = await cache.getModels();
      } catch {
        models = cache.getCachedModels() || [];
      }
    }
    let activeModelId: string | undefined;
    try {
      activeModelId = UserConfigManager.getInstance().getDefaultModel();
    } catch {
      // Fallback
    }
    this.modelBrowserModal = new ModelAccordionBrowser(models ?? [], activeModelId);
    this.commandOutput = null;
    this.isCommandMode = false;
    this.commandBuffer = "";
    this.requestRender();
  }

  public setDimensions(dims: TuiDimensions): void {
    this.renderer.setDimensions(dims);
    this.requestRender();
  }

  public getCursorPosition(): number {
    return this.cursorPosition;
  }

  public getSavedDraft(): string {
    return this.savedDraft;
  }

  public clearSavedDraft(): void {
    this.savedDraft = "";
  }

  public start(): void {
    this.isRunning = true;
    // Enter alternate screen buffer, hide cursor, clear and home
    this.output.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
    this.renderNow();
  }

  public stop(): void {
    this.isRunning = false;
    this.modelBrowserModal = null;
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = undefined;
    }
    if (this.unregisterStateListener) {
      this.unregisterStateListener();
      this.unregisterStateListener = undefined;
    }
    // Restore normal screen buffer and restore cursor
    this.output.write("\x1b[?1049l\x1b[?25h");

    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // Safe fallback in test/mock environments
      }
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
    let paletteOverlay: { filtered: PaletteCommand[]; selectedIndex: number } | undefined;
    if (this.isCommandMode && this.commandBuffer.startsWith("/")) {
      const filtered = CommandPalette.filterCommands(this.commandBuffer);
      paletteOverlay = {
        filtered,
        selectedIndex: this.paletteSelectedIndex,
      };
    }

    let activeModel: string | undefined;
    try {
      activeModel = UserConfigManager.getInstance().getDefaultModel();
    } catch {
      // Fallback
    }

    const rendered = this.renderer.render(
      this.currentView,
      this.stateAdapter,
      this.isCommandMode ? this.commandBuffer : "",
      this.errorMessage,
      this.isCommandMode,
      this.isCommandMode ? this.cursorPosition : undefined,
      this.commandOutput ?? undefined,
      paletteOverlay,
      activeModel,
      this.modelBrowserModal
    );

    // In alternate buffer, position at home (1,1) and write frame WITHOUT trailing newline!
    this.output.write("\x1b[H" + rendered);
  }

  /**
   * Helper to identify Up Arrow key sequences across standard ANSI, VT, and modified variants.
   */
  public static isArrowUp(token: string): boolean {
    return /^\x1b(?:\[|O)[0-9;]*[Aa]$/.test(token);
  }

  /**
   * Helper to identify Down Arrow key sequences across standard ANSI, VT, and modified variants.
   */
  public static isArrowDown(token: string): boolean {
    return /^\x1b(?:\[|O)[0-9;]*[Bb]$/.test(token);
  }

  /**
   * Helper to identify Left Arrow key sequences across standard ANSI, VT, and modified variants.
   */
  public static isArrowLeft(token: string): boolean {
    return /^\x1b(?:\[|O)[0-9;]*[Dd]$/.test(token);
  }

  /**
   * Helper to identify Right Arrow key sequences across standard ANSI, VT, and modified variants.
   */
  public static isArrowRight(token: string): boolean {
    return /^\x1b(?:\[|O)[0-9;]*[Cc]$/.test(token);
  }

  /**
   * Helper to identify Home key sequences across standard terminals.
   */
  public static isHome(token: string): boolean {
    return /^\x1b(?:\[(?:[0-9;]*[Hh]|[17]~)|OH)$/.test(token);
  }

  /**
   * Helper to identify End key sequences across standard terminals.
   */
  public static isEnd(token: string): boolean {
    return /^\x1b(?:\[(?:[0-9;]*[Ff]|[48]~)|OF)$/.test(token);
  }

  /**
   * Helper to identify Forward Delete key sequences across standard terminals.
   */
  public static isDelete(token: string): boolean {
    return /^\x1b\[3(?:;[0-9]+)*~$/.test(token);
  }

  /**
   * Helper to identify Page Up key sequences across standard terminals.
   */
  public static isPageUp(token: string): boolean {
    return /^\x1b\[5(?:;[0-9]+)*~$/.test(token);
  }

  /**
   * Helper to identify Page Down key sequences across standard terminals.
   */
  public static isPageDown(token: string): boolean {
    return /^\x1b\[6(?:;[0-9]+)*~$/.test(token);
  }

  /**
   * Helper to identify Function keys (F1-F12) across standard terminals.
   */
  public static isFunctionKey(token: string): boolean {
    return /^\x1b(?:O[P-S]|\[(?:1[1-57-9]|2[0-13-4])(?:;[0-9]+)*~)$/.test(token);
  }

  /**
   * Helper to identify any ANSI escape sequence.
   */
  public static isEscapeSequence(token: string): boolean {
    return token.startsWith("\x1b") && token.length > 1;
  }

  /**
   * Decode an input string into discrete key tokens and remainder buffer.
   */
  public static decodeInputTokens(input: string, flush = false): { tokens: string[]; remainder: string } {
    const tokens: string[] = [];
    let i = 0;

    while (i < input.length) {
      if (input[i] === "\x1b") {
        if (i + 1 >= input.length) {
          if (flush) {
            tokens.push("\x1b");
            i++;
          }
          break;
        }

        const nextChar = input[i + 1];
        if (nextChar === "[") {
          // CSI sequence: \x1b[ ... <terminator in 0x40-0x7E>
          let j = i + 2;
          while (j < input.length) {
            const code = input.charCodeAt(j);
            if (code >= 0x40 && code <= 0x7e) {
              break;
            }
            j++;
          }
          if (j < input.length) {
            tokens.push(input.slice(i, j + 1));
            i = j + 1;
          } else {
            if (flush) {
              tokens.push(input.slice(i));
              i = input.length;
            }
            break;
          }
        } else if (nextChar === "O") {
          // SS3 sequence: \x1bO <char>
          if (i + 2 < input.length) {
            tokens.push(input.slice(i, i + 3));
            i += 3;
          } else {
            if (flush) {
              tokens.push(input.slice(i));
              i = input.length;
            }
            break;
          }
        } else if (nextChar === "]") {
          // OSC sequence: \x1b] ... <BEL (\x07) or ST (\x1b\\)>
          let j = i + 2;
          let found = false;
          while (j < input.length) {
            if (input[j] === "\x07") {
              found = true;
              break;
            }
            if (input[j] === "\x1b" && j + 1 < input.length && input[j + 1] === "\\") {
              j++; // include backslash
              found = true;
              break;
            }
            j++;
          }
          if (found) {
            tokens.push(input.slice(i, j + 1));
            i = j + 1;
          } else {
            if (flush) {
              tokens.push(input.slice(i));
              i = input.length;
            }
            break;
          }
        } else {
          // 2-character escape sequence (e.g. Alt+<char>, \x1b<char>)
          tokens.push(input.slice(i, i + 2));
          i += 2;
        }
      } else {
        tokens.push(input[i]!);
        i++;
      }
    }

    return { tokens, remainder: input.slice(i) };
  }

  /**
   * Handle raw keyboard / character input.
   */
  public async handleInput(input: string): Promise<boolean> {
    this.errorMessage = "";

    const { tokens } = TuiController.decodeInputTokens(input, true);

    for (const token of tokens) {
      const keepRunning = await this.handleSingleToken(token);
      if (!keepRunning) {
        return false;
      }
    }

    return true;
  }

  /**
   * Process a single decoded token or key sequence.
   */
  private async handleSingleToken(token: string): Promise<boolean> {
    // 0. Model Accordion Browser modal key routing
    if (this.modelBrowserModal) {
      const result = this.modelBrowserModal.handleKey(token);
      if (result.action === "close") {
        this.modelBrowserModal = null;
        this.requestRender();
        return true;
      }
      if (result.action === "select") {
        const selectedId = result.selectedModelId;
        this.modelBrowserModal = null;
        if (selectedId) {
          try {
            UserConfigManager.getInstance().setDefaultModel(selectedId);
            if (this.commandRegistry && this.commandParser) {
              await this.commandRegistry.execute(this.commandParser.parse(`/model ${selectedId}`));
            }
          } catch {
            // Safe fallback
          }
        }
        this.errorMessage = "";
        this.requestRender();
        return true;
      }
      if (result.action === "render") {
        this.requestRender();
        return true;
      }
      return true;
    }

    // Bracketed paste markers (200~ start, 201~ end)
    if (token === "\x1b[200~") {
      this.isBracketedPaste = true;
      return true;
    }
    if (token === "\x1b[201~") {
      this.isBracketedPaste = false;
      return true;
    }

    if (this.isBracketedPaste) {
      if (this.isCommandMode) {
        if (token === "\r" || token === "\n" || token === "\t") {
          // In bracketed paste, replace newlines/tabs with space rather than submitting prematurely
          if (this.commandBuffer.length > 0 && !this.commandBuffer.endsWith(" ")) {
            this.commandBuffer += " ";
            this.cursorPosition = this.commandBuffer.length;
            this.requestRender();
          }
          return true;
        }
        if (TuiController.isEscapeSequence(token)) {
          return true;
        }
        if (token.length === 1 && token >= " ") {
          this.commandBuffer =
            this.commandBuffer.slice(0, this.cursorPosition) + token + this.commandBuffer.slice(this.cursorPosition);
          this.cursorPosition++;
          this.requestRender();
          return true;
        }
      }
      // Swallow pasted characters in normal mode to prevent accidental hotkey execution
      return true;
    }

    if (this.isCommandMode) {
      // 1. Command Palette / History navigation via Up / Down arrows
      if (TuiController.isArrowUp(token)) {
        if (this.commandBuffer.startsWith("/")) {
          const filtered = CommandPalette.filterCommands(this.commandBuffer);
          if (filtered.length > 0) {
            this.paletteSelectedIndex =
              (this.paletteSelectedIndex - 1 + filtered.length) % filtered.length;
            this.requestRender();
            return true;
          }
        }
        if (this.commandHistory.length > 0) {
          if (this.historyIndex === -1) {
            this.historyDraft = this.commandBuffer;
            this.historyIndex = this.commandHistory.length - 1;
          } else if (this.historyIndex > 0) {
            this.historyIndex--;
          }
          this.commandBuffer = this.commandHistory[this.historyIndex]!;
          this.cursorPosition = this.commandBuffer.length;
          this.requestRender();
        }
        return true;
      }

      if (TuiController.isArrowDown(token)) {
        if (this.commandBuffer.startsWith("/")) {
          const filtered = CommandPalette.filterCommands(this.commandBuffer);
          if (filtered.length > 0) {
            this.paletteSelectedIndex =
              (this.paletteSelectedIndex + 1) % filtered.length;
            this.requestRender();
            return true;
          }
        }
        if (this.historyIndex !== -1) {
          if (this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            this.commandBuffer = this.commandHistory[this.historyIndex]!;
          } else {
            this.historyIndex = -1;
            this.commandBuffer = this.historyDraft;
          }
          this.cursorPosition = this.commandBuffer.length;
          this.requestRender();
        }
        return true;
      }

      // 2. Cursor navigation: Left, Right, Home, End
      if (TuiController.isArrowLeft(token)) {
        if (this.cursorPosition > 0) {
          this.cursorPosition--;
          this.requestRender();
        }
        return true;
      }

      if (TuiController.isArrowRight(token)) {
        if (this.cursorPosition < this.commandBuffer.length) {
          this.cursorPosition++;
          this.requestRender();
        }
        return true;
      }

      if (TuiController.isHome(token)) {
        this.cursorPosition = 0;
        this.requestRender();
        return true;
      }

      if (TuiController.isEnd(token)) {
        this.cursorPosition = this.commandBuffer.length;
        this.requestRender();
        return true;
      }

      // Forward Delete: deletes character at cursor position
      if (TuiController.isDelete(token)) {
        if (this.cursorPosition < this.commandBuffer.length) {
          this.commandBuffer =
            this.commandBuffer.slice(0, this.cursorPosition) + this.commandBuffer.slice(this.cursorPosition + 1);
          this.requestRender();
        }
        return true;
      }

      // Other unhandled escape sequences: ignore without polluting buffer
      if (TuiController.isEscapeSequence(token)) {
        return true;
      }

      // Tab completion for command palette
      if (token === "\t") {
        if (this.commandBuffer.startsWith("/")) {
          const filtered = CommandPalette.filterCommands(this.commandBuffer);
          if (filtered.length > 0) {
            const selected = filtered[Math.min(this.paletteSelectedIndex, filtered.length - 1)];
            if (selected) {
              this.commandBuffer = selected.command + " ";
              this.cursorPosition = this.commandBuffer.length;
              this.paletteSelectedIndex = 0;
              this.requestRender();
              return true;
            }
          }
        }
        return true;
      }

      // 3. Submit command (Enter)
      if (token === "\r" || token === "\n") {
        let toExec = this.commandBuffer.trim();
        if (this.commandBuffer.startsWith("/")) {
          const filtered = CommandPalette.filterCommands(this.commandBuffer);
          if (filtered.length > 0) {
            const selected = filtered[this.paletteSelectedIndex];
            if (toExec === "/" || (!toExec.includes(" ") && selected)) {
              toExec = selected?.command ?? toExec;
            }
          }
        }
        this.isCommandMode = false;
        this.commandBuffer = "";
        this.cursorPosition = 0;
        this.historyIndex = -1;
        this.historyDraft = "";
        this.savedDraft = "";
        this.paletteSelectedIndex = 0;
        this.isBracketedPaste = false;

        // Empty command line or bare '/' / ':' cancels or clears without Zod error dump
        if (toExec && !/^[/:\s]*$/.test(toExec)) {
          this.recordCommandHistory(toExec);
          await this.executeCommand(toExec);
        }
        this.requestRender();
        return true;
      }

      // 4. Cancel command mode
      // ESC (\u001B / \x1b): preserves draft for rapid mode toggle (: -> ESC -> :)
      if (token === "\u001B" || token === "\x1b" || token.toLowerCase() === "escape") {
        const draftToSave = this.historyIndex !== -1 ? this.historyDraft : this.commandBuffer;
        this.savedDraft = draftToSave;
        this.isCommandMode = false;
        this.commandBuffer = "";
        this.cursorPosition = 0;
        this.historyIndex = -1;
        this.historyDraft = "";
        this.paletteSelectedIndex = 0;
        this.isBracketedPaste = false;
        this.requestRender();
        return true;
      }

      // Ctrl+C (\u0003): explicitly aborts command mode and discards draft
      if (token === "\u0003") {
        this.savedDraft = "";
        this.isCommandMode = false;
        this.commandBuffer = "";
        this.cursorPosition = 0;
        this.historyIndex = -1;
        this.historyDraft = "";
        this.isBracketedPaste = false;
        this.requestRender();
        return true;
      }

      // Ctrl+D (\u0004): EOF on empty buffer exits command mode cleanly
      if (token === "\u0004") {
        if (this.commandBuffer.length === 0) {
          this.isCommandMode = false;
          this.cursorPosition = 0;
          this.historyIndex = -1;
          this.requestRender();
        }
        return true;
      }

      // 5. Backspace
      if (token === "\u007F" || token === "\b") {
        if (this.cursorPosition > 0) {
          this.commandBuffer =
            this.commandBuffer.slice(0, this.cursorPosition - 1) + this.commandBuffer.slice(this.cursorPosition);
          this.cursorPosition--;
          this.requestRender();
        }
        return true;
      }

      // Ctrl+L (\u000c): Redraw screen
      if (token === "\u000c") {
        this.renderNow();
        return true;
      }

      // Ctrl+U (\u0015): Erase line
      if (token === "\u0015") {
        this.commandBuffer = "";
        this.cursorPosition = 0;
        this.requestRender();
        return true;
      }

      // Ctrl+W (\u0017): Erase previous word
      if (token === "\u0017") {
        const left = this.commandBuffer.slice(0, this.cursorPosition);
        const right = this.commandBuffer.slice(this.cursorPosition);
        const pruned = left.replace(/\s*\S+\s*$/, "");
        this.commandBuffer = pruned + right;
        this.cursorPosition = pruned.length;
        this.requestRender();
        return true;
      }

      // 6. Append printable character (skip unhandled control characters)
      if (!token.startsWith("\x1b") && token.length === 1 && token >= " ") {
        this.commandBuffer =
          this.commandBuffer.slice(0, this.cursorPosition) + token + this.commandBuffer.slice(this.cursorPosition);
        this.cursorPosition++;
        this.paletteSelectedIndex = 0;
        this.requestRender();
        return true;
      }

      return true;
    }

    // Normal navigation mode
    // 1. Arrow keys and escape sequences: MUST NOT terminate the application
    if (
      TuiController.isArrowUp(token) ||
      TuiController.isArrowDown(token) ||
      TuiController.isArrowLeft(token) ||
      TuiController.isArrowRight(token) ||
      TuiController.isHome(token) ||
      TuiController.isEnd(token) ||
      TuiController.isDelete(token) ||
      TuiController.isPageUp(token) ||
      TuiController.isPageDown(token) ||
      TuiController.isFunctionKey(token) ||
      TuiController.isEscapeSequence(token)
    ) {
      return true;
    }

    // 2. Normal mode actions
    if (this.commandOutput) {
      if (
        token === "c" ||
        token === "C" ||
        token === "\x1b" ||
        token === "\u001B" ||
        token.toLowerCase() === "escape" ||
        token === "\r" ||
        token === "\n"
      ) {
        this.commandOutput = null;
        this.requestRender();
        return true;
      }
    }

    switch (token) {
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
      case "u":
      case "U":
        this.setView("usage");
        return true;
      case "?":
      case "h":
        this.setView("help");
        return true;
      case ":":
        this.isCommandMode = true;
        this.commandBuffer = this.savedDraft;
        this.cursorPosition = this.commandBuffer.length;
        this.historyIndex = -1;
        this.historyDraft = this.savedDraft;
        this.paletteSelectedIndex = 0;
        this.requestRender();
        return true;
      case "/":
        this.isCommandMode = true;
        this.commandBuffer = this.savedDraft || "/";
        this.cursorPosition = this.commandBuffer.length;
        this.historyIndex = -1;
        this.historyDraft = this.commandBuffer;
        this.paletteSelectedIndex = 0;
        this.requestRender();
        return true;
      case "r":
      case "\u000c": // Ctrl+L redraws screen
        this.renderNow();
        return true;
      case "q":
      case "\u001B":
      case "escape":
      case "Escape":
      case "\u0003": // Ctrl+C terminates normal mode
      case "\u0004": // Ctrl+D (EOF) terminates normal mode
        this.stop();
        return false;
    }

    return true;
  }

  private recordCommandHistory(command: string): void {
    const norm = (cmd: string) => cmd.replace(/^[/:\s]+/, "").trim();
    if (
      this.commandHistory.length === 0 ||
      norm(this.commandHistory[this.commandHistory.length - 1]!) !== norm(command)
    ) {
      this.commandHistory.push(command);
      while (this.commandHistory.length > this.maxHistorySize) {
        this.commandHistory.shift();
      }
    }
  }

  public getCommandHistory(): string[] {
    return [...this.commandHistory];
  }

  public clearCommandHistory(): void {
    this.commandHistory = [];
    this.historyIndex = -1;
    this.historyDraft = "";
    this.savedDraft = "";
    this.cursorPosition = 0;
  }

  public isInCommandMode(): boolean {
    return this.isCommandMode;
  }

  public getCommandBuffer(): string {
    return this.commandBuffer;
  }

  public getErrorMessage(): string {
    return this.errorMessage;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Bridge slash command to authoritative CommandRegistry.
   */
  public async executeCommand(rawCommand: string): Promise<void> {
    if (!this.commandRegistry || !this.commandParser) {
      this.errorMessage = "Command execution bridge unavailable.";
      return;
    }

    const trimmed = rawCommand.trim();
    if (!trimmed || /^[/:\s]*$/.test(trimmed)) {
      return;
    }

    try {
      const parsed = this.commandParser.parse(
        trimmed.startsWith("/") || trimmed.startsWith(":") ? trimmed : `/${trimmed}`
      );
      const nameLower = parsed.name.toLowerCase();

      // Intercept /models, /model, /m without arguments in interactive TUI mode to launch ModelAccordionBrowser modal
      if ((nameLower === "models" || nameLower === "model" || nameLower === "m") && parsed.args.length === 0) {
        await this.openModelBrowserModal();
        return;
      }

      const result = await this.commandRegistry.execute(parsed);

      if (!result.success) {
        let errStr = result.error ?? "Command failed.";
        if (errStr.includes('"code"') && errStr.includes('"message"') && this.errorHandler) {
          errStr = this.errorHandler.handleError(parsed.name, new Error(errStr)).error ?? errStr;
        }
        this.errorMessage = errStr.replace(/\r?\n\s*/g, " ").trim();
        this.commandOutput = null;
      } else {
        this.errorMessage = "";
        const nameLower = parsed.name.toLowerCase();
        if (nameLower === "clear") {
          this.commandOutput = null;
          this.errorMessage = "";
          this.requestRender();
          return;
        } else if (nameLower === "usage") {
          this.setView("usage");
          this.commandOutput = null;
          this.requestRender();
          return;
        }

        if (result.message) {
          this.commandOutput = {
            title: `COMMAND RESULT: /${parsed.name.toUpperCase()}`,
            lines: result.message.split("\n"),
          };
        } else {
          this.commandOutput = null;
        }
      }

      if (result.exitRequested) {
        this.stop();
      }
    } catch (err) {
      if (this.errorHandler) {
        const handled = this.errorHandler.handleError("tui", err);
        this.errorMessage = (handled.error ?? "Command error.").replace(/\r?\n\s*/g, " ").trim();
      } else {
        const raw = err instanceof Error ? err.message : String(err);
        this.errorMessage = raw.replace(/\r?\n\s*/g, " ").trim();
      }
    }
  }
}
