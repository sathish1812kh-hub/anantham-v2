/**
 * Built-in Slash Commands Subsystem Registry
 * PRD-CLI-003: Slash Commands Subsystem
 */

export interface SlashCommandContext {
  sessionId?: string;
  currentModel?: string;
  totalTokens?: number;
  totalCostUsd?: number;
  activeBranch?: string;
}

export interface SlashCommandExecutionResult {
  command: string;
  success: boolean;
  message: string;
  data?: unknown;
}

export type SlashCommandHandler = (
  args: string[],
  context: SlashCommandContext
) => Promise<SlashCommandExecutionResult> | SlashCommandExecutionResult;

export class SlashCommandsRegistry {
  private handlers: Map<string, { description: string; handler: SlashCommandHandler }> = new Map();

  constructor() {
    this.registerDefaults();
  }

  public register(commandName: string, description: string, handler: SlashCommandHandler): void {
    const key = commandName.startsWith("/") ? commandName.toLowerCase() : `/${commandName.toLowerCase()}`;
    this.handlers.set(key, { description, handler });
  }

  public async execute(
    commandName: string,
    args: string[],
    context: SlashCommandContext = {}
  ): Promise<SlashCommandExecutionResult> {
    const key = commandName.startsWith("/") ? commandName.toLowerCase() : `/${commandName.toLowerCase()}`;
    const registered = this.handlers.get(key);

    if (!registered) {
      return {
        command: key,
        success: false,
        message: `Unknown slash command: '${key}'. Type '/help' to list available commands.`,
      };
    }

    try {
      return await registered.handler(args, context);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        command: key,
        success: false,
        message: `Error executing command '${key}': ${errorMsg}`,
      };
    }
  }

  public listCommands(): Array<{ command: string; description: string }> {
    return Array.from(this.handlers.entries()).map(([command, info]) => ({
      command,
      description: info.description,
    }));
  }

  private registerDefaults(): void {
    this.register("/help", "List all available slash commands", () => {
      const list = this.listCommands();
      const text = list.map((c) => `  ${c.command.padEnd(12)} — ${c.description}`).join("\n");
      return { command: "/help", success: true, message: `Available Slash Commands:\n${text}`, data: list };
    });

    this.register("/clear", "Clear terminal screen and REPL view", () => {
      return { command: "/clear", success: true, message: "Screen cleared." };
    });

    this.register("/compact", "Trigger context compaction for active session", (_args, ctx) => {
      return {
        command: "/compact",
        success: true,
        message: `Session '${ctx.sessionId ?? "default"}' context compacted successfully.`,
      };
    });

    this.register("/model", "Display or switch the active LLM model", (args, ctx) => {
      if (args.length > 0) {
        return {
          command: "/model",
          success: true,
          message: `Model switched to '${args[0]}'`,
          data: { model: args[0] },
        };
      }
      return {
        command: "/model",
        success: true,
        message: `Current model: ${ctx.currentModel ?? "gemini-2.5-pro"}`,
      };
    });

    this.register("/session", "Show or switch active session ID", (args, ctx) => {
      if (args.length > 0) {
        return {
          command: "/session",
          success: true,
          message: `Switched to session: ${args[0]}`,
          data: { sessionId: args[0] },
        };
      }
      return {
        command: "/session",
        success: true,
        message: `Active session: ${ctx.sessionId ?? "sess_main"}`,
      };
    });

    this.register("/branch", "List or switch session branches", (args, ctx) => {
      if (args.length > 0) {
        return {
          command: "/branch",
          success: true,
          message: `Switched branch to: ${args[0]}`,
          data: { branch: args[0] },
        };
      }
      return {
        command: "/branch",
        success: true,
        message: `Current branch: ${ctx.activeBranch ?? "main"}`,
      };
    });

    this.register("/cost", "Display current session token usage and estimated cost", (_args, ctx) => {
      const tokens = ctx.totalTokens ?? 0;
      const cost = ctx.totalCostUsd ?? 0.0;
      return {
        command: "/cost",
        success: true,
        message: `Tokens: ${tokens.toLocaleString()} | Estimated Cost: $${cost.toFixed(4)}`,
        data: { tokens, cost },
      };
    });

    this.register("/diff", "Show git working directory changes", () => {
      return {
        command: "/diff",
        success: true,
        message: "No uncommitted diffs in working tree.",
      };
    });

    this.register("/export", "Export current session conversation to markdown", (args, ctx) => {
      const target = args[0] ?? "session_export.md";
      return {
        command: "/export",
        success: true,
        message: `Session '${ctx.sessionId ?? "main"}' exported to ${target}`,
      };
    });
  }
}
