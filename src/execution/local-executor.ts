import { spawn } from "node:child_process";
import {
  type ExecutionRequest,
  type ExecutionResult,
  ExecutionRequestSchema,
} from "../domain/execution.js";
import { resolveSafePath } from "../tools/native/path-utils.js";
import { ProcessSupervisor } from "./process-supervisor.js";
import { killProcessTree } from "./process-tree-killer.js";

export interface LocalExecutorOptions {
  supervisor?: ProcessSupervisor;
  defaultTimeoutMs?: number;
  defaultMaxOutputBytes?: number;
  defaultProjectRoot?: string;
}

export class LocalExecutor {
  public readonly type = "local" as const;
  private readonly supervisor: ProcessSupervisor;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxOutputBytes: number;
  private readonly defaultProjectRoot: string;

  constructor(options: LocalExecutorOptions = {}) {
    this.supervisor = options.supervisor || new ProcessSupervisor();
    this.defaultTimeoutMs = options.defaultTimeoutMs || 30000;
    this.defaultMaxOutputBytes = options.defaultMaxOutputBytes || 1024 * 1024; // 1MB
    this.defaultProjectRoot = options.defaultProjectRoot || process.cwd();
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const validated = ExecutionRequestSchema.parse(request);
    const root = validated.projectRoot || this.defaultProjectRoot;
    const workingDir = validated.cwd ? resolveSafePath(root, validated.cwd) : root;
    const timeout = validated.timeoutMs || validated.limits?.timeoutMs || this.defaultTimeoutMs;
    const maxOutput = validated.maxOutputBytes || validated.limits?.maxOutputBytes || this.defaultMaxOutputBytes;

    this.supervisor.register(validated);
    this.supervisor.transition(validated.executionId, "starting");

    const startTime = Date.now();

    // Sanitize Environment: drop raw secrets and sensitive tokens
    const sanitizedEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (
        k.toUpperCase().includes("KEY") ||
        k.toUpperCase().includes("SECRET") ||
        k.toUpperCase().includes("TOKEN") ||
        k.toUpperCase().includes("PASSWORD")
      ) {
        continue;
      }
      if (v !== undefined) {
        sanitizedEnv[k] = v;
      }
    }

    if (validated.env) {
      for (const [k, v] of Object.entries(validated.env)) {
        sanitizedEnv[k] = v;
      }
    }

    return new Promise<ExecutionResult>((resolve) => {
      let isSettled = false;
      let stdoutBuffer = "";
      let stderrBuffer = "";
      let truncated = false;

      const child = spawn(validated.command, validated.args || [], {
        cwd: workingDir,
        env: sanitizedEnv,
        shell: true,
      });

      if (child.pid) {
        this.supervisor.setPid(validated.executionId, child.pid);
      }
      this.supervisor.transition(validated.executionId, "running");

      const timeoutId = setTimeout(async () => {
        if (isSettled) return;
        isSettled = true;
        if (child.pid) {
          await killProcessTree(child.pid);
        }
        this.supervisor.transition(validated.executionId, "timed_out", { timeoutMs: timeout });
        this.supervisor.cleanup(validated.executionId);

        resolve({
          executionId: validated.executionId,
          executorType: "local",
          status: "timed_out",
          exitCode: null,
          stdout: this.scrubSecrets(stdoutBuffer),
          stderr: `${this.scrubSecrets(stderrBuffer)}\n[Execution timed out after ${timeout}ms]`.trim(),
          truncated,
          durationMs: Date.now() - startTime,
          error: `Process timed out after ${timeout}ms`,
        });
      }, timeout);

      this.supervisor.setTimeout(validated.executionId, timeoutId);

      child.stdout.on("data", (chunk: Buffer) => {
        if (Buffer.byteLength(stdoutBuffer) < maxOutput) {
          stdoutBuffer += chunk.toString("utf8");
          if (Buffer.byteLength(stdoutBuffer) >= maxOutput) {
            truncated = true;
            stdoutBuffer = stdoutBuffer.slice(0, maxOutput) + "\n[STDOUT_TRUNCATED]";
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (Buffer.byteLength(stderrBuffer) < maxOutput) {
          stderrBuffer += chunk.toString("utf8");
          if (Buffer.byteLength(stderrBuffer) >= maxOutput) {
            truncated = true;
            stderrBuffer = stderrBuffer.slice(0, maxOutput) + "\n[STDERR_TRUNCATED]";
          }
        }
      });

      child.on("error", (err) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutId);
        this.supervisor.transition(validated.executionId, "failed", { error: err.message });
        this.supervisor.cleanup(validated.executionId);

        resolve({
          executionId: validated.executionId,
          executorType: "local",
          status: "failed",
          exitCode: 1,
          stdout: this.scrubSecrets(stdoutBuffer),
          stderr: this.scrubSecrets(stderrBuffer || err.message),
          truncated,
          durationMs: Date.now() - startTime,
          error: err.message,
        });
      });

      child.on("close", (code, signal) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutId);

        const status = code === 0 ? "completed" : signal ? "killed" : "failed";
        this.supervisor.transition(
          validated.executionId,
          status === "completed" ? "completed" : "failed",
          { code, signal }
        );
        this.supervisor.cleanup(validated.executionId);

        resolve({
          executionId: validated.executionId,
          executorType: "local",
          status,
          exitCode: code,
          stdout: this.scrubSecrets(stdoutBuffer),
          stderr: this.scrubSecrets(stderrBuffer),
          truncated,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  private scrubSecrets(text: string): string {
    if (!text) return "";
    return text.replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_SECRET]");
  }
}
