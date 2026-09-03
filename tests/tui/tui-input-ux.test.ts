import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Readable, Writable } from "node:stream";
import { z } from "zod";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { CliErrorHandler } from "../../src/cli/error-handler.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";
import { TuiApplication } from "../../src/tui/tui-application.js";

describe("TUI Input UX & Interactive Handling (R1, R2, R3)", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let sessionController: SessionController;
  let commandRegistry: CommandRegistry;
  let parser: CommandParser;
  let errorHandler: CliErrorHandler;
  let adapter: TuiStateAdapter;
  let renderer: TuiRenderer;
  let controller: TuiController;
  let renderedOutput: string;

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
    errorHandler = new CliErrorHandler();

    adapter = new TuiStateAdapter({ projectRepo, sessionRepo, taskRepo });
    renderer = new TuiRenderer({ dimensions: { width: 80, height: 24 } });

    renderedOutput = "";
    const outStream = new Writable({
      write(chunk, _enc, cb) {
        renderedOutput += chunk.toString();
        cb();
      },
    });

    controller = new TuiController({
      stateAdapter: adapter,
      renderer,
      commandRegistry,
      commandParser: parser,
      errorHandler,
      output: outStream,
      coalesceIntervalMs: 0,
    });
    controller.start();
  });

  afterEach(() => {
    controller.stop();
    adapter.destroy();
    engine.close();
  });

  // =========================================================================
  // R1: Robust ANSI Escape Sequence & Arrow Key Handling
  // =========================================================================
  describe("R1: ANSI Escape Sequences & Arrow Key Handling", () => {
    it("arrow keys in normal mode do not terminate the application", async () => {
      // Standard CSI arrows
      expect(await controller.handleInput("\x1b[A")).toBe(true); // Up
      expect(await controller.handleInput("\x1b[B")).toBe(true); // Down
      expect(await controller.handleInput("\x1b[C")).toBe(true); // Right
      expect(await controller.handleInput("\x1b[D")).toBe(true); // Left

      // SS3 cursor arrows
      expect(await controller.handleInput("\x1bOA")).toBe(true); // Up
      expect(await controller.handleInput("\x1bOB")).toBe(true); // Down
      expect(await controller.handleInput("\x1bOC")).toBe(true); // Right
      expect(await controller.handleInput("\x1bOD")).toBe(true); // Left

      // Modifier arrows (e.g. Ctrl+Arrow)
      expect(await controller.handleInput("\x1b[1;5A")).toBe(true);
      expect(await controller.handleInput("\x1b[1;5B")).toBe(true);

      // Verify controller is still actively running and on dashboard
      expect(controller.getCurrentView()).toBe("dashboard");
      expect(controller.isInCommandMode()).toBe(false);
    });

    it("arrow keys in command mode do not terminate the application or pollute buffer", async () => {
      // Enter command mode
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);

      // Left, Right, and arbitrary escape sequences
      expect(await controller.handleInput("\x1b[C")).toBe(true);
      expect(await controller.handleInput("\x1b[D")).toBe(true);
      expect(await controller.handleInput("\x1b[H")).toBe(true); // Home
      expect(await controller.handleInput("\x1b[F")).toBe(true); // End

      // Buffer should remain clean and not contain escape chars
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.isInCommandMode()).toBe(true);
    });

    it("full TuiApplication stream loop processes arrow keys without premature exit", async () => {
      const app = new TuiApplication({ dbPath: ":memory:" });
      await app.initialize();

      // Input stream sending arrows, view switches, and finally 'q' to quit
      const inStream = Readable.from([
        "\x1b[A", // Up arrow
        "\x1b[B", // Down arrow
        "2",       // Switch to session view
        "\x1b[C", // Right arrow
        "3",       // Switch to tasks view
        "\x1b[D", // Left arrow
        "q",       // Graceful exit
      ]);

      await app.start(inStream);

      expect(app.controller.getCurrentView()).toBe("tasks");
      app.shutdown();
    });

    it("buffers cross-chunk fragmented ANSI escape sequences in stream loop", async () => {
      const app = new TuiApplication({ dbPath: ":memory:" });
      await app.initialize();

      // Fragmented chunks: '\x1b[' followed by 'A', then '2', then 'q'
      const inStream = Readable.from([
        "\x1b[", // Incomplete CSI
        "A",     // CSI terminator completes Up Arrow
        "2",     // Switch to session view
        "q",     // Quit
      ]);

      await app.start(inStream);

      expect(app.controller.getCurrentView()).toBe("session");
      app.shutdown();
    });

    it("decodeInputTokens decodes single, compound, and trailing escape sequences", () => {
      // Single arrow
      const single = TuiController.decodeInputTokens("\x1b[A");
      expect(single.tokens).toEqual(["\x1b[A"]);
      expect(single.remainder).toBe("");

      // Compound input: text + arrow + text
      const compound = TuiController.decodeInputTokens("abc\x1b[Bdef");
      expect(compound.tokens).toEqual(["a", "b", "c", "\x1b[B", "d", "e", "f"]);
      expect(compound.remainder).toBe("");

      // Incomplete trailing CSI
      const partial = TuiController.decodeInputTokens("1\x1b[", false);
      expect(partial.tokens).toEqual(["1"]);
      expect(partial.remainder).toBe("\x1b[");

      // Incomplete trailing CSI with flush=true
      const flushed = TuiController.decodeInputTokens("1\x1b[", true);
      expect(flushed.tokens).toEqual(["1", "\x1b["]);
      expect(flushed.remainder).toBe("");
    });
  });

  // =========================================================================
  // R1 / Command History: Command Navigation in Command Mode
  // =========================================================================
  describe("R1 / History: Command History Navigation", () => {
    it("navigates command history with Up and Down arrows in command mode", async () => {
      // 1. Execute three commands
      await controller.handleInput(":");
      await controller.handleInput("project create \"Proj Alpha\"\r");

      await controller.handleInput(":");
      await controller.handleInput("project create \"Proj Beta\"\r");

      await controller.handleInput(":");
      await controller.handleInput("project create \"Proj Gamma\"\r");

      const history = controller.getCommandHistory();
      expect(history.length).toBe(3);
      expect(history[0]).toBe('project create "Proj Alpha"');
      expect(history[1]).toBe('project create "Proj Beta"');
      expect(history[2]).toBe('project create "Proj Gamma"');

      // 2. Enter command mode and type partial draft
      await controller.handleInput(":");
      expect(controller.getCommandBuffer()).toBe("");
      for (const ch of "draft work") {
        await controller.handleInput(ch);
      }
      expect(controller.getCommandBuffer()).toBe("draft work");

      // 3. Up arrow recalls most recent command
      await controller.handleInput("\x1b[A");
      expect(controller.getCommandBuffer()).toBe('project create "Proj Gamma"');

      // 4. Up arrow recalls second most recent command
      await controller.handleInput("\x1b[A");
      expect(controller.getCommandBuffer()).toBe('project create "Proj Beta"');

      // 5. Up arrow recalls oldest command
      await controller.handleInput("\x1b[A");
      expect(controller.getCommandBuffer()).toBe('project create "Proj Alpha"');

      // 6. Up arrow at top stays bounded at oldest command
      await controller.handleInput("\x1b[A");
      expect(controller.getCommandBuffer()).toBe('project create "Proj Alpha"');

      // 7. Down arrow moves forward in history
      await controller.handleInput("\x1b[B");
      expect(controller.getCommandBuffer()).toBe('project create "Proj Beta"');

      await controller.handleInput("\x1b[B");
      expect(controller.getCommandBuffer()).toBe('project create "Proj Gamma"');

      // 8. Down arrow past newest history entry restores draft
      await controller.handleInput("\x1b[B");
      expect(controller.getCommandBuffer()).toBe("draft work");
    });

    it("pressing Up arrow with empty history does not crash or corrupt state", async () => {
      expect(controller.getCommandHistory().length).toBe(0);

      await controller.handleInput(":");
      await controller.handleInput("\x1b[A"); // Up arrow
      expect(controller.getCommandBuffer()).toBe("");

      await controller.handleInput("\x1b[B"); // Down arrow
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.isInCommandMode()).toBe(true);
    });

    it("does not insert duplicate consecutive entries into history", async () => {
      await controller.handleInput(":");
      await controller.handleInput("help\r");

      await controller.handleInput(":");
      await controller.handleInput("help\r");

      expect(controller.getCommandHistory()).toEqual(["help"]);
    });
  });

  // =========================================================================
  // R2: Graceful Command Parsing & Error Formatting
  // =========================================================================
  describe("R2: Graceful Command Parsing & Error Formatting", () => {
    it("CommandParser rejects empty, whitespace, and bare slash/colon inputs with clean errors", () => {
      expect(() => parser.parse("")).toThrow("Empty command input.");
      expect(() => parser.parse("   ")).toThrow("Empty command input.");
      expect(() => parser.parse("/")).toThrow("Empty command input.");
      expect(() => parser.parse(":")).toThrow("Empty command input.");
      expect(() => parser.parse("/   ")).toThrow("Empty command input.");
      expect(() => parser.parse(":   ")).toThrow("Empty command input.");
    });

    it("CommandParser parses colon-prefixed commands identically to slash commands", () => {
      const parsed = parser.parse(':project create "Colon Proj"');
      expect(parsed.name).toBe("project");
      expect(parsed.isSlashCommand).toBe(true);
      expect(parsed.args).toEqual(["create", "Colon Proj"]);
    });

    it("CommandParser.formatZodError formats ZodError into concise, single-line message", () => {
      const TestSchema = z.object({
        name: z.string().min(3, "Name must be at least 3 characters"),
        count: z.number().int("Count must be integer"),
      });

      const result = TestSchema.safeParse({ name: "a", count: 3.14 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const formatted = CommandParser.formatZodError(result.error);
        expect(formatted).not.toContain("\n");
        expect(formatted).toContain("Command validation failed:");
        expect(formatted).toContain("name: Name must be at least 3 characters");
        expect(formatted).toContain("count: Count must be integer");
      }
    });

    it("CliErrorHandler formats raw Zod JSON error arrays into clean single-line messages", () => {
      const rawZodJson = JSON.stringify([
        {
          code: "too_small",
          minimum: 1,
          type: "string",
          inclusive: true,
          exact: false,
          message: "String must contain at least 1 character(s)",
          path: ["name"],
        },
      ]);

      const res = errorHandler.handleError("test", new Error(rawZodJson));
      expect(res.success).toBe(false);
      expect(res.error).toBe("Command validation failed: name: String must contain at least 1 character(s)");
      expect(res.error).not.toContain("\n");
      expect(res.error).not.toContain("{");
    });

    it("pressing Enter on empty command line or bare slash cancels/clears without Zod dump", async () => {
      // Empty command line
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);
      await controller.handleInput("\r");
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getErrorMessage()).toBe("");

      // Bare slash '/'
      await controller.handleInput("/");
      expect(controller.isInCommandMode()).toBe(true);
      await controller.handleInput("\r");
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getErrorMessage()).toBe("");

      // Bare colon ':'
      await controller.handleInput(":");
      await controller.handleInput("\n");
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getErrorMessage()).toBe("");
    });

    it("invalid command execution formats error as clean single-line message without Zod JSON", async () => {
      await controller.handleInput(":");
      await controller.handleInput("nonexistent_command_xyz\r");

      expect(controller.isInCommandMode()).toBe(false);
      const errMsg = controller.getErrorMessage();
      expect(errMsg).toBeTruthy();
      expect(errMsg).not.toContain("\n");
      expect(errMsg).not.toContain('"code":');
      expect(errMsg).toContain('Unknown command "/nonexistent_command_xyz"');
    });
  });

  // =========================================================================
  // R3: Interactive Mode Indicators & UX Polish
  // =========================================================================
  describe("R3: Interactive Mode Indicators & Transitions", () => {
    it("supports both ':' and '/' to enter command mode from normal mode", async () => {
      // Enter with ':'
      expect(controller.isInCommandMode()).toBe(false);
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);

      // Cancel with ESC
      await controller.handleInput("\u001B");
      expect(controller.isInCommandMode()).toBe(false);

      // Enter with '/'
      await controller.handleInput("/");
      expect(controller.isInCommandMode()).toBe(true);

      // Cancel with ESC
      await controller.handleInput("\u001B");
      expect(controller.isInCommandMode()).toBe(false);
    });

    it("ESC in command mode exits back to normal navigation mode without quitting TUI", async () => {
      await controller.handleInput(":");
      for (const ch of "some command draft") {
        await controller.handleInput(ch);
      }
      expect(controller.isInCommandMode()).toBe(true);
      expect(controller.getCommandBuffer()).toBe("some command draft");

      // ESC exits command mode
      const keepRunning = await controller.handleInput("\u001B");
      expect(keepRunning).toBe(true); // Does NOT quit!
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getCommandBuffer()).toBe("");

      // Normal mode navigation works immediately
      await controller.handleInput("3");
      expect(controller.getCurrentView()).toBe("tasks");
    });

    it("renders [NORMAL MODE] indicator showing [1-9] Views, [:] Command, [q] Quit", () => {
      const rendered = renderer.render("dashboard", adapter, "", "", false);
      expect(rendered).toContain("[NORMAL MODE]");
      expect(rendered).toContain("[1-9] Views, [:] Command, [q] Quit");
      expect(rendered).not.toContain("[COMMAND MODE]");
    });

    it("renders [COMMAND MODE] indicator showing active prompt, [ENTER] Run, [ESC] Cancel", () => {
      // Empty prompt in command mode
      const emptyPromptRender = renderer.render("dashboard", adapter, "", "", true);
      expect(emptyPromptRender).toContain("[COMMAND MODE]");
      expect(emptyPromptRender).toContain(" : _ | [ENTER] Run, [ESC] Cancel");

      // Active prompt in command mode
      const activePromptRender = renderer.render("dashboard", adapter, "project list", "", true);
      expect(activePromptRender).toContain("[COMMAND MODE]");
      expect(activePromptRender).toContain(" : project list_ | [ENTER] Run, [ESC] Cancel");
    });

    it("prevents accidental view changes when typing in command mode", async () => {
      await controller.handleInput(":");
      expect(controller.getCurrentView()).toBe("dashboard");

      // Type "123" into command buffer
      await controller.handleInput("1");
      await controller.handleInput("2");
      await controller.handleInput("3");

      // View must NOT have changed from dashboard
      expect(controller.getCurrentView()).toBe("dashboard");
      expect(controller.getCommandBuffer()).toBe("123");
    });
  });

  // =========================================================================
  // Adversarial Edge Cases: Bracketed Paste, Modifier Arrows, OSC Sequences
  // =========================================================================
  describe("Adversarial Robustness & Edge Cases", () => {
    it("bracketed paste in command mode preserves multi-line paste without premature execution", async () => {
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);

      // Simulate terminal bracketed paste with embedded newlines and tabs
      const pasteData = "\x1b[200~project create \"Alpha\"\r\n--description \"Multi line\"\x1b[201~";
      await controller.handleInput(pasteData);

      // Must remain in command mode with concatenated, sanitized buffer
      expect(controller.isInCommandMode()).toBe(true);
      expect(controller.getCommandBuffer()).toBe('project create "Alpha" --description "Multi line"');
      // No commands should have executed yet
      expect(projectRepo.list().length).toBe(0);

      // Now pressing Enter explicitly executes the command
      await controller.handleInput("\r");
      expect(controller.isInCommandMode()).toBe(false);
      expect(projectRepo.list().length).toBe(1);
    });

    it("bracketed paste in normal mode does not trigger hotkey view switching or exit", async () => {
      expect(controller.getCurrentView()).toBe("dashboard");

      // Paste text containing 'q', '1', '2', '3' inside bracketed paste
      const pasteData = "\x1b[200~q 2 3 4 exit\x1b[201~";
      const keepRunning = await controller.handleInput(pasteData);

      expect(keepRunning).toBe(true);
      expect(controller.getCurrentView()).toBe("dashboard");
      expect(controller.isInCommandMode()).toBe(false);
    });

    it("all modifier arrow variants navigate command history in command mode", async () => {
      await controller.handleInput(":");
      await controller.handleInput("project create \"Proj 1\"\r");
      await controller.handleInput(":");
      await controller.handleInput("project create \"Proj 2\"\r");

      await controller.handleInput(":");
      // Alt+Up (\x1b[1;3A)
      await controller.handleInput("\x1b[1;3A");
      expect(controller.getCommandBuffer()).toBe('project create "Proj 2"');

      // Shift+Up (\x1b[1;2A)
      await controller.handleInput("\x1b[1;2A");
      expect(controller.getCommandBuffer()).toBe('project create "Proj 1"');

      // Alt+Down (\x1b[1;3B)
      await controller.handleInput("\x1b[1;3B");
      expect(controller.getCommandBuffer()).toBe('project create "Proj 2"');
    });

    it("OSC window titles and 2-byte escape sequences do not terminate normal mode", async () => {
      expect(controller.getCurrentView()).toBe("dashboard");

      // BEL-terminated OSC
      expect(await controller.handleInput("\x1b]0;Anantham TUI\x07")).toBe(true);
      // ST-terminated OSC
      expect(await controller.handleInput("\x1b]0;Anantham TUI\x1b\\")).toBe(true);
      // Alt+key (e.g. Alt+x = \x1bx)
      expect(await controller.handleInput("\x1bx")).toBe(true);
      // Mouse reporting
      expect(await controller.handleInput("\x1b[<0;20;10M")).toBe(true);

      expect(controller.getCurrentView()).toBe("dashboard");
      expect(controller.isInCommandMode()).toBe(false);
    });

    it("repeated slashes and colons cancel/clear cleanly on Enter without error banners", async () => {
      for (const input of ["//", "::", "///", ":::", "/:", ":/", "  /  ", "  :  "]) {
        await controller.handleInput(":");
        expect(controller.isInCommandMode()).toBe(true);
        for (const ch of input) {
          await controller.handleInput(ch);
        }
        await controller.handleInput("\r");
        expect(controller.isInCommandMode()).toBe(false);
        expect(controller.getErrorMessage()).toBe("");
      }
    });

    it("CommandParser rejects multi-slash and multi-colon inputs with clean error", () => {
      expect(() => parser.parse("//")).toThrow("Empty command input.");
      expect(() => parser.parse("::")).toThrow("Empty command input.");
      expect(() => parser.parse("///")).toThrow("Empty command input.");
      expect(() => parser.parse("/:")).toThrow("Empty command input.");
      expect(() => parser.parse(":::")).toThrow("Empty command input.");
    });

    it("CliErrorHandler formats embedded Zod JSON object and text-wrapped JSON into single-line messages", () => {
      const wrappedJson = 'Validation error occurred: {"issues":[{"code":"too_small","message":"Min 1 char","path":["name"]}]}';
      const res = errorHandler.handleError("test", new Error(wrappedJson));
      expect(res.success).toBe(false);
      expect(res.error).toBe("Command validation failed: name: Min 1 char");
      expect(res.error).not.toContain("\n");
      expect(res.error).not.toContain("{");
    });

    it("TuiApplication flushes standalone ESC via timer in streaming loop", async () => {
      const app = new TuiApplication({ dbPath: ":memory:" });
      await app.initialize();

      // Send ':' then ESC without closing stream immediately, then 'q'
      const inStream = new Readable({
        read() {},
      });

      const startPromise = app.start(inStream);

      // Enter command mode
      inStream.push(":");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(app.controller.isInCommandMode()).toBe(true);

      // Send ESC alone (stream does NOT end)
      inStream.push("\x1b");
      // Wait for 50ms escape timeout to fire
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(app.controller.isInCommandMode()).toBe(false);

      // Now quit
      inStream.push("q");
      inStream.push(null);
      await startPromise;

      app.shutdown();
    });

    it("adapts mode indicators and truncates prompts cleanly on narrow/wide terminals", () => {
      const narrowRenderer = new TuiRenderer({ dimensions: { width: 40, height: 24 } });
      const wideRenderer = new TuiRenderer({ dimensions: { width: 120, height: 24 } });

      // Narrow normal mode: should use compact indicator and fit within 40 columns
      const narrowNormal = narrowRenderer.render("dashboard", adapter, "", "", false);
      const narrowNormalLines = narrowNormal.split("\n");
      const narrowNormalLine = narrowNormalLines[narrowNormalLines.length - 1]!;
      expect(narrowNormalLine).toContain("[NORMAL] [:] Cmd, [q] Quit");
      expect(narrowNormalLine.length).toBeLessThanOrEqual(40);

      // Narrow command mode: should use compact [CMD] indicator and fit within 40 columns
      const narrowCommand = narrowRenderer.render("dashboard", adapter, "long_command_argument_foo_bar_baz", "", true);
      const narrowCommandLines = narrowCommand.split("\n");
      const narrowCommandLine = narrowCommandLines[narrowCommandLines.length - 1]!;
      expect(narrowCommandLine).toContain("[CMD] :");
      expect(narrowCommandLine).toContain("[↵] [ESC]");
      expect(narrowCommandLine.length).toBeLessThanOrEqual(40);

      // Wide command mode with long prompt: should truncate with ellipsis without wrapping
      const veryLongPrompt = "a".repeat(150);
      const wideCommand = wideRenderer.render("dashboard", adapter, veryLongPrompt, "", true);
      const wideCommandLine = wideCommand.split("\n").find((l) => l.includes("[COMMAND MODE]"))!;
      expect(wideCommandLine.length).toBeLessThanOrEqual(120);
      expect(wideCommandLine).toContain("...");
    });

    it("caps command history at maxHistorySize and discards oldest entries", async () => {
      const smallHistoryController = new TuiController({
        stateAdapter: adapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        errorHandler,
        maxHistorySize: 3,
        coalesceIntervalMs: 0,
      });
      smallHistoryController.start();

      for (const cmd of ["cmd1", "cmd2", "cmd3", "cmd4", "cmd5"]) {
        await smallHistoryController.handleInput(":");
        await smallHistoryController.handleInput(`${cmd}\r`);
      }

      expect(smallHistoryController.getCommandHistory()).toEqual(["cmd3", "cmd4", "cmd5"]);
      smallHistoryController.stop();
    });

    it("deduplicates commands in history even with varied leading slashes/colons", async () => {
      await controller.handleInput(":");
      await controller.handleInput("/help\r");

      await controller.handleInput(":");
      await controller.handleInput("help\r");

      await controller.handleInput(":");
      await controller.handleInput(":help\r");

      expect(controller.getCommandHistory()).toEqual(["/help"]);
    });

    it("preserves draft buffer across rapid mode toggles (colon/slash -> ESC -> colon/slash)", async () => {
      // Enter command mode and type draft
      await controller.handleInput(":");
      for (const ch of 'task create "Alpha"') {
        await controller.handleInput(ch);
      }
      expect(controller.getCommandBuffer()).toBe('task create "Alpha"');

      // ESC exits back to normal mode
      await controller.handleInput("\u001B");
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getCommandBuffer()).toBe("");

      // Re-enter command mode with ':' -> draft is restored!
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);
      expect(controller.getCommandBuffer()).toBe('task create "Alpha"');

      // Exit and re-enter with '/' -> draft is still preserved!
      await controller.handleInput("\u001B");
      await controller.handleInput("/");
      expect(controller.isInCommandMode()).toBe(true);
      expect(controller.getCommandBuffer()).toBe('task create "Alpha"');

      // Submitting the draft executes it and clears saved draft
      await controller.handleInput("\r");
      expect(controller.isInCommandMode()).toBe(false);

      // Re-entering command mode starts clean
      await controller.handleInput(":");
      expect(controller.getCommandBuffer()).toBe("");
    });

    it("clears saved draft on Ctrl+C abort in command mode", async () => {
      await controller.handleInput(":");
      for (const ch of "draft to discard") {
        await controller.handleInput(ch);
      }
      expect(controller.getCommandBuffer()).toBe("draft to discard");

      // Ctrl+C aborts and discards draft
      await controller.handleInput("\u0003");
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getCommandBuffer()).toBe("");

      // Re-entering command mode does NOT restore the aborted draft
      await controller.handleInput(":");
      expect(controller.getCommandBuffer()).toBe("");
    });

    it("preserves uncommitted draft even when cancelling while browsing history", async () => {
      // Execute a command first
      await controller.handleInput(":");
      await controller.handleInput("first_command\r");

      // Type an uncommitted draft
      await controller.handleInput(":");
      for (const ch of "my_uncommitted_draft") {
        await controller.handleInput(ch);
      }

      // Press Up Arrow to recall history (displays 'first_command')
      await controller.handleInput("\x1b[A");
      expect(controller.getCommandBuffer()).toBe("first_command");

      // Press ESC to return to normal mode
      await controller.handleInput("\u001B");
      expect(controller.isInCommandMode()).toBe(false);

      // Re-enter command mode: user's uncommitted draft is restored!
      await controller.handleInput(":");
      expect(controller.getCommandBuffer()).toBe("my_uncommitted_draft");
    });

    it("supports cursor navigation (Left, Right, Home, End) and mid-line editing", async () => {
      await controller.handleInput(":");
      for (const ch of "hello") {
        await controller.handleInput(ch);
      }
      expect(controller.getCommandBuffer()).toBe("hello");
      expect(controller.getCursorPosition()).toBe(5);

      // Left arrow twice: moves cursor to position 3
      await controller.handleInput("\x1b[D");
      await controller.handleInput("\x1b[D");
      expect(controller.getCursorPosition()).toBe(3);

      // Insert 'XY' in middle
      await controller.handleInput("X");
      await controller.handleInput("Y");
      expect(controller.getCommandBuffer()).toBe("helXYlo");
      expect(controller.getCursorPosition()).toBe(5);

      // Home key moves cursor to start
      await controller.handleInput("\x1b[H");
      expect(controller.getCursorPosition()).toBe(0);
      await controller.handleInput("Z");
      expect(controller.getCommandBuffer()).toBe("ZhelXYlo");
      expect(controller.getCursorPosition()).toBe(1);

      // End key moves cursor to end
      await controller.handleInput("\x1b[F");
      expect(controller.getCursorPosition()).toBe(8);

      // Right arrow at end stays at end
      await controller.handleInput("\x1b[C");
      expect(controller.getCursorPosition()).toBe(8);

      // Left arrow once then backspace
      await controller.handleInput("\x1b[D"); // cursor at 7 (before 'o')
      await controller.handleInput("\u007F"); // deletes 'l' at index 6
      expect(controller.getCommandBuffer()).toBe("ZhelXYo");
      expect(controller.getCursorPosition()).toBe(6);
    });

    it("supports control keys (Ctrl+U, Ctrl+W, Ctrl+L, Ctrl+D, Ctrl+C in normal mode)", async () => {
      await controller.handleInput(":");
      for (const ch of "git commit -m message") {
        await controller.handleInput(ch);
      }
      expect(controller.getCommandBuffer()).toBe("git commit -m message");

      // Ctrl+W erases previous word
      await controller.handleInput("\u0017");
      expect(controller.getCommandBuffer()).toBe("git commit -m");

      // Ctrl+U clears line
      await controller.handleInput("\u0015");
      expect(controller.getCommandBuffer()).toBe("");

      // Ctrl+D on empty buffer exits command mode cleanly
      await controller.handleInput("\u0004");
      expect(controller.isInCommandMode()).toBe(false);

      // Ctrl+L in normal mode triggers redraw
      expect(await controller.handleInput("\u000c")).toBe(true);

      // Ctrl+C in normal mode terminates application
      const running = await controller.handleInput("\u0003");
      expect(running).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });

    it("handles backspace on empty buffer and at start without errors", async () => {
      await controller.handleInput(":");
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.getCursorPosition()).toBe(0);

      // Backspace on empty buffer
      expect(await controller.handleInput("\u007F")).toBe(true);
      expect(await controller.handleInput("\b")).toBe(true);
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.getCursorPosition()).toBe(0);

      // Type one char, backspace twice
      await controller.handleInput("a");
      await controller.handleInput("\b");
      expect(controller.getCommandBuffer()).toBe("");
      await controller.handleInput("\b");
      expect(controller.getCommandBuffer()).toBe("");
    });

    it("TuiApplication.stop() cleans up timers, streams, and resize listeners without leaking", async () => {
      const app = new TuiApplication({ dbPath: ":memory:" });
      await app.initialize();

      const inStream = new Readable({ read() {} });
      const runPromise = app.start(inStream);

      // Send partial input to schedule 50ms escapeTimer
      inStream.push("\x1b[");

      // Stop application immediately
      app.stop();
      expect(app.controller.getIsRunning()).toBe(false);

      inStream.push(null);
      await runPromise;
    });

    it("forward delete key (\\x1b[3~) in command mode deletes at cursor position, handling start, mid, end, and empty buffer", async () => {
      await controller.handleInput(":");
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.getCursorPosition()).toBe(0);

      // Delete on empty buffer: no-op, no error
      expect(await controller.handleInput("\x1b[3~")).toBe(true);
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.getCursorPosition()).toBe(0);

      // Type "hello" -> cursor is at 5
      for (const ch of "hello") {
        await controller.handleInput(ch);
      }
      expect(controller.getCommandBuffer()).toBe("hello");
      expect(controller.getCursorPosition()).toBe(5);

      // Delete at end of buffer: no-op
      expect(await controller.handleInput("\x1b[3~")).toBe(true);
      expect(controller.getCommandBuffer()).toBe("hello");
      expect(controller.getCursorPosition()).toBe(5);

      // Home key -> cursor at 0
      await controller.handleInput("\x1b[H");
      expect(controller.getCursorPosition()).toBe(0);

      // Delete at start deletes 'h'
      await controller.handleInput("\x1b[3~");
      expect(controller.getCommandBuffer()).toBe("ello");
      expect(controller.getCursorPosition()).toBe(0);

      // Move cursor to position 2 (pointing to second 'l')
      await controller.handleInput("\x1b[C"); // cursor at 1 ('l')
      await controller.handleInput("\x1b[C"); // cursor at 2 ('l')
      expect(controller.getCursorPosition()).toBe(2);

      // Delete at mid-buffer deletes second 'l'
      await controller.handleInput("\x1b[3~");
      expect(controller.getCommandBuffer()).toBe("elo");
      expect(controller.getCursorPosition()).toBe(2); // now pointing to 'o'

      // Delete deletes 'o'
      await controller.handleInput("\x1b[3~");
      expect(controller.getCommandBuffer()).toBe("el");
      expect(controller.getCursorPosition()).toBe(2);

      // Delete at end is no-op
      await controller.handleInput("\x1b[3~");
      expect(controller.getCommandBuffer()).toBe("el");
      expect(controller.getCursorPosition()).toBe(2);
    });

    it("forward delete key in normal mode does not terminate application", async () => {
      expect(controller.getCurrentView()).toBe("dashboard");

      // Standard Delete
      expect(await controller.handleInput("\x1b[3~")).toBe(true);
      // Modifier Delete (Ctrl+Delete, Shift+Delete)
      expect(await controller.handleInput("\x1b[3;5~")).toBe(true);
      expect(await controller.handleInput("\x1b[3;2~")).toBe(true);

      expect(controller.getIsRunning()).toBe(true);
      expect(controller.getCurrentView()).toBe("dashboard");
      expect(controller.isInCommandMode()).toBe(false);
    });

    it("PageUp, PageDown, and Function keys (F1-F12) do not terminate normal mode or pollute command buffer", async () => {
      // Normal mode
      expect(controller.getCurrentView()).toBe("dashboard");
      const testKeys = [
        "\x1b[5~", // PageUp
        "\x1b[6~", // PageDown
        "\x1bOP",  // F1
        "\x1bOQ",  // F2
        "\x1bOR",  // F3
        "\x1bOS",  // F4
        "\x1b[15~", // F5
        "\x1b[17~", // F6
        "\x1b[18~", // F7
        "\x1b[19~", // F8
        "\x1b[20~", // F9
        "\x1b[21~", // F10
        "\x1b[23~", // F11
        "\x1b[24~", // F12
      ];

      for (const key of testKeys) {
        expect(await controller.handleInput(key)).toBe(true);
      }
      expect(controller.getIsRunning()).toBe(true);
      expect(controller.getCurrentView()).toBe("dashboard");

      // Command mode
      await controller.handleInput(":");
      for (const ch of "cmd_draft") {
        await controller.handleInput(ch);
      }
      expect(controller.getCommandBuffer()).toBe("cmd_draft");

      for (const key of testKeys) {
        expect(await controller.handleInput(key)).toBe(true);
      }
      // Buffer must remain intact and unpolluted
      expect(controller.getCommandBuffer()).toBe("cmd_draft");
      expect(controller.isInCommandMode()).toBe(true);
    });

    it("formats Zod union errors with unpacked branch messages in CommandParser and CliErrorHandler", () => {
      const UnionSchema = z.object({
        target: z.union([
          z.string().min(5, "String must be at least 5 chars"),
          z.number().int("Number must be an integer"),
        ]),
      });

      const parseResult = UnionSchema.safeParse({ target: true });
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        const parserFormatted = CommandParser.formatZodError(parseResult.error);
        expect(parserFormatted).toContain("target: Invalid input:");
        expect(parserFormatted).toContain("Expected string, received boolean");
        expect(parserFormatted).toContain("Expected number, received boolean");
        expect(parserFormatted).not.toContain("\n");

        const handlerResult = errorHandler.handleError("test", parseResult.error);
        expect(handlerResult.success).toBe(false);
        expect(handlerResult.error).toContain("target: Invalid input:");
        expect(handlerResult.error).toContain("Expected string, received boolean");
        expect(handlerResult.error).toContain("Expected number, received boolean");
        expect(handlerResult.error).not.toContain("\n");
      }

      // Also verify when input matches type of one branch but fails validation (Zod targets branch directly)
      const parseResult2 = UnionSchema.safeParse({ target: "abc" });
      expect(parseResult2.success).toBe(false);
      if (!parseResult2.success) {
        const parserFormatted2 = CommandParser.formatZodError(parseResult2.error);
        expect(parserFormatted2).toBe("Command validation failed: target: String must be at least 5 chars");
      }

      // Also verify JSON string format handling with unionErrors
      const rawJsonWithUnion = JSON.stringify({
        issues: [
          {
            code: "invalid_union",
            path: ["option"],
            message: "Invalid input",
            unionErrors: [
              { issues: [{ message: "Expected string, received boolean" }] },
              { issues: [{ message: "Expected number, received boolean" }] },
            ],
          },
        ],
      });

      const handledJson = errorHandler.handleError("test", new Error(rawJsonWithUnion));
      expect(handledJson.success).toBe(false);
      expect(handledJson.error).toContain("option: Invalid input: Expected string, received boolean OR Expected number, received boolean");
      expect(handledJson.error).not.toContain("\n");
      expect(handledJson.error).not.toContain("{");
    });

    it("integrates full TuiCommandBridge slash command execution with state adapter and command history", async () => {
      // 1. Execute valid slash command via command mode
      await controller.handleInput(":");
      for (const ch of 'project create "Integration Proj"') {
        await controller.handleInput(ch);
      }
      await controller.handleInput("\r");

      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getErrorMessage()).toBe("");
      expect(controller.getCommandHistory()).toContain('project create "Integration Proj"');

      // Verify ProjectRepository was updated
      const projects = projectRepo.list();
      expect(projects.length).toBe(1);
      expect(projects[0]!.name).toBe("Integration Proj");

      // Verify TuiStateAdapter has updated project info
      expect(adapter.getProjects().length).toBe(1);
      expect(adapter.getProjects()[0]!.name).toBe("Integration Proj");

      // 2. Execute invalid command: should produce concise single-line error in controller
      await controller.handleInput(":");
      for (const ch of "task create") {
        await controller.handleInput(ch);
      }
      await controller.handleInput("\r");

      expect(controller.isInCommandMode()).toBe(false);
      const err = controller.getErrorMessage();
      expect(err).toBeTruthy();
      expect(err).not.toContain("\n");
      expect(err).not.toContain('"code":');
    });
  });
});
