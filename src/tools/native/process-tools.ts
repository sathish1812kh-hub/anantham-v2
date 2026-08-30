import { exec } from "node:child_process";
import { type ToolRegistration } from "../tool-registry.js";
import { resolveSafePath } from "./path-utils.js";

export interface ProcessToolsOptions {
  projectRoot?: string;
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
}

export function createProcessTools(options: ProcessToolsOptions = {}): ToolRegistration[] {
  const getRoot = () => options.projectRoot || process.cwd();
  const defaultTimeoutMs = options.defaultTimeoutMs || 30000;
  const maxOutputBytes = options.maxOutputBytes || 1024 * 1024; // 1MB

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
      const root = getRoot();
      const workingDir = args.cwd ? resolveSafePath(root, args.cwd) : root;
      const timeout = args.timeoutMs || defaultTimeoutMs;

      return new Promise((resolve, reject) => {
        const child = exec(
          args.command,
          {
            cwd: workingDir,
            timeout,
            maxBuffer: maxOutputBytes,
            env: {
              ...process.env,
              // Strip raw secrets from sub-environment
              API_KEY: undefined,
              SECRET_KEY: undefined,
            },
          },
          (error, stdout, stderr) => {
            const cleanStdout = stdout
              ? String(stdout).replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_SECRET]")
              : "";
            const cleanStderr = stderr
              ? String(stderr).replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_SECRET]")
              : "";

            if (error) {
              resolve({
                command: args.command,
                exitCode: error.code || 1,
                stdout: cleanStdout,
                stderr: cleanStderr || error.message,
                failed: true,
              });
              return;
            }

            resolve({
              command: args.command,
              exitCode: 0,
              stdout: cleanStdout,
              stderr: cleanStderr,
              failed: false,
            });
          }
        );

        if (context.signal) {
          context.signal.addEventListener("abort", () => {
            child.kill("SIGKILL");
            reject(new Error(`Command aborted: ${args.command}`));
          });
        }
      });
    },
  };

  return [runCommandTool];
}
