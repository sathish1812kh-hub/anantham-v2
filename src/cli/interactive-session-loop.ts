import readline from "node:readline/promises";
import { type Readable, type Writable } from "node:stream";
import { CommandParser } from "./command-parser.js";
import { CommandRegistry } from "./command-registry.js";
import { OutputRenderer } from "./output-renderer.js";
import { SessionController } from "./session-controller.js";
import { CliErrorHandler } from "./error-handler.js";

export interface InteractiveSessionLoopOptions {
  parser: CommandParser;
  registry: CommandRegistry;
  renderer: OutputRenderer;
  controller: SessionController;
  errorHandler?: CliErrorHandler;
  input?: Readable;
  output?: Writable;
  promptPrefix?: string;
}

/**
 * Interactive CLI REPL Session Loop.
 * PRD Part 2 Section 170–175.
 */
export class InteractiveSessionLoop {
  private readonly parser: CommandParser;
  private readonly registry: CommandRegistry;
  private readonly renderer: OutputRenderer;
  private readonly controller: SessionController;
  private readonly errorHandler: CliErrorHandler;
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly promptPrefix: string;
  private isRunning = false;

  constructor(options: InteractiveSessionLoopOptions) {
    this.parser = options.parser;
    this.registry = options.registry;
    this.renderer = options.renderer;
    this.controller = options.controller;
    this.errorHandler = options.errorHandler ?? new CliErrorHandler();
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.promptPrefix = options.promptPrefix ?? "anantham";
  }

  public async run(): Promise<void> {
    const rl = readline.createInterface({
      input: this.input,
      output: this.output,
      terminal: false,
    });

    this.isRunning = true;

    try {
      this.output.write(this.buildPrompt());
      for await (const rawLine of rl) {
        if (!this.isRunning) break;

        const trimmed = rawLine.trim();
        if (trimmed) {
          try {
            const parsed = this.parser.parse(trimmed);
            const result = await this.registry.execute(parsed);
            const rendered = this.renderer.renderResult(result);

            this.output.write(rendered + "\n");

            if (result.exitRequested) {
              this.isRunning = false;
              break;
            }
          } catch (err) {
            const errResult = this.errorHandler.handleError("repl", err);
            const rendered = this.renderer.renderResult(errResult);
            this.output.write(rendered + "\n");
          }
        }

        if (this.isRunning) {
          this.output.write(this.buildPrompt());
        }
      }
    } finally {
      rl.close();
      this.isRunning = false;
    }
  }

  public stop(): void {
    this.isRunning = false;
  }

  private buildPrompt(): string {
    const ctx = this.controller.getContext();
    const proj = ctx.activeProjectId ? ctx.activeProjectId : "-";
    const sess = ctx.activeSessionId ? ctx.activeSessionId : "-";
    return `${this.promptPrefix} [${proj}/${sess}] > `;
  }
}
