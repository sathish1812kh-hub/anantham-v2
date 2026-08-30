import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  type ExecutionRequest,
  type ExecutionResult,
  ExecutionRequestSchema,
} from "../domain/execution.js";
import { resolveSafePath } from "../tools/native/path-utils.js";
import { ProcessSupervisor } from "./process-supervisor.js";

const execAsync = promisify(exec);

export interface DockerSandboxExecutorOptions {
  supervisor?: ProcessSupervisor;
  defaultImage?: string;
  defaultProjectRoot?: string;
}

export class DockerSandboxExecutor {
  public readonly type = "docker" as const;
  private readonly defaultImage: string;
  private readonly defaultProjectRoot: string;

  constructor(options: DockerSandboxExecutorOptions = {}) {
    this.defaultImage = options.defaultImage || "alpine:latest";
    this.defaultProjectRoot = options.defaultProjectRoot || process.cwd();
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await execAsync("docker info", { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const validated = ExecutionRequestSchema.parse(request);
    const root = validated.projectRoot || this.defaultProjectRoot;
    const startTime = Date.now();

    // 1. Privileged Container Check
    if (validated.sandbox?.privileged) {
      return {
        executionId: validated.executionId,
        executorType: "docker",
        status: "failed",
        exitCode: 1,
        stdout: "",
        stderr: "Security violation: Privileged containers are strictly prohibited.",
        truncated: false,
        durationMs: Date.now() - startTime,
        error: "Privileged containers prohibited",
      };
    }

    // 2. Mount Validation (Strict Containment)
    if (validated.sandbox?.mounts) {
      for (const mount of validated.sandbox.mounts) {
        try {
          resolveSafePath(root, mount.hostPath);
        } catch {
          return {
            executionId: validated.executionId,
            executorType: "docker",
            status: "failed",
            exitCode: 1,
            stdout: "",
            stderr: `Security violation: Mount path "${mount.hostPath}" attempts to escape project boundary "${root}".`,
            truncated: false,
            durationMs: Date.now() - startTime,
            error: "Mount escape prohibited",
          };
        }

        const normalizedHost = path.resolve(mount.hostPath).toLowerCase();
        if (
          normalizedHost === "c:\\" ||
          normalizedHost === "c:/" ||
          normalizedHost === "/" ||
          normalizedHost.includes("docker.sock") ||
          normalizedHost.includes("windows\\system32")
        ) {
          return {
            executionId: validated.executionId,
            executorType: "docker",
            status: "failed",
            exitCode: 1,
            stdout: "",
            stderr: `Security violation: Mounting host sensitive system path "${mount.hostPath}" is forbidden.`,
            truncated: false,
            durationMs: Date.now() - startTime,
            error: "System mount forbidden",
          };
        }
      }
    }

    // 3. Availability Check (Fail Closed - No silent host fallback!)
    const available = await this.isAvailable();
    if (!available) {
      return {
        executionId: validated.executionId,
        executorType: "docker",
        status: "failed",
        exitCode: 1,
        stdout: "",
        stderr: "Executor unavailable: Docker daemon is not accessible or not running. Isolation downgrade to host execution is strictly denied.",
        truncated: false,
        durationMs: Date.now() - startTime,
        error: "Docker daemon unavailable",
      };
    }

    // 4. Construct Bounded Docker Run Command
    const image = validated.sandbox?.image || this.defaultImage;
    const networkFlag = validated.sandbox?.network === "allowed" ? "--network bridge" : "--network none";
    const memFlag = validated.limits?.maxMemoryMb ? `-m ${validated.limits.maxMemoryMb}m` : "";
    const capDropFlag = "--cap-drop=ALL";

    const mountFlags = (validated.sandbox?.mounts || [])
      .map((m) => {
        const ro = m.readOnly ? ":ro" : "";
        return `-v "${resolveSafePath(root, m.hostPath)}:${m.containerPath}${ro}"`;
      })
      .join(" ");

    const dockerCmd = `docker run --rm ${capDropFlag} ${networkFlag} ${memFlag} ${mountFlags} ${image} ${validated.command} ${(validated.args || []).join(" ")}`.trim();

    try {
      const { stdout, stderr } = await execAsync(dockerCmd, {
        timeout: validated.timeoutMs || 30000,
      });

      return {
        executionId: validated.executionId,
        executorType: "docker",
        status: "completed",
        exitCode: 0,
        stdout,
        stderr,
        truncated: false,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        executionId: validated.executionId,
        executorType: "docker",
        status: "failed",
        exitCode: err.code || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message,
        truncated: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      };
    }
  }
}
