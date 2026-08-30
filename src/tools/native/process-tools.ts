import { type ToolRegistration } from "../tool-registry.js";
import { LocalExecutor } from "../../execution/local-executor.js";

export interface ProcessToolsOptions {
  projectRoot?: string;
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  executor?: LocalExecutor;
}

export function createProcessTools(options: ProcessToolsOptions = {}): ToolRegistration[] {
  const executor =
    options.executor ||
    new LocalExecutor({
      defaultProjectRoot: options.projectRoot,
      defaultTimeoutMs: options.defaultTimeoutMs,
      defaultMaxOutputBytes: options.maxOutputBytes,
    });

  const runCommandTool: ToolRegistration = {
    definition: {
      name: "run_command",
      description: "Execute a shell command within the project boundary.",
      parametersSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string" },
          timeoutMs: { type: "number" },
        },
        required: ["command"],
      },
      isIdempotent: false,
      riskLevel: "high",
    },
    handler: async (args: any, context) => {
      const result = await executor.execute({
        executionId: context.callId,
        executorType: "local",
        command: args.command,
        cwd: args.cwd,
        projectRoot: options.projectRoot,
        timeoutMs: args.timeoutMs,
      });

      return {
        command: args.command,
        exitCode: result.exitCode ?? (result.status === "completed" ? 0 : 1),
        stdout: result.stdout,
        stderr: result.stderr,
        failed: result.status !== "completed",
      };
    },
  };

  return [runCommandTool];
}
