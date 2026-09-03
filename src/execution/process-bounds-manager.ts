/**
 * Process Lifecycle & Resource Bounds Manager
 * PRD-EXEC-005: Process Lifecycle & Resource Bounds
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { ProcessBounds } from "./types.js";

export interface ProcessExecutionOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export class ProcessBoundsManager {
  private activeProcesses: Map<number, ChildProcess> = new Map();

  public enforceBufferLimit(output: string, maxBufferBytes: number): string {
    if (output.length <= maxBufferBytes) return output;
    return output.slice(0, maxBufferBytes) + "\n[TRUNCATED: max buffer exceeded]";
  }

  public async executeBoundedProcess(
    command: string,
    args: string[],
    cwd: string,
    bounds: ProcessBounds,
    env: Record<string, string> = process.env as Record<string, string>
  ): Promise<ProcessExecutionOutput> {
    const startTime = Date.now();
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let timedOut = false;
    let truncated = false;

    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        env,
        shell: false,
      });

      if (child.pid) {
        this.activeProcesses.set(child.pid, child);
      }

      // Timeout timer
      const timer = setTimeout(() => {
        timedOut = true;
        this.killProcessTree(child, bounds.killSignal ?? "SIGTERM");
      }, bounds.timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdoutBuffer.length + chunk.length > bounds.maxBufferBytes) {
          truncated = true;
          const allowed = bounds.maxBufferBytes - stdoutBuffer.length;
          if (allowed > 0) {
            stdoutBuffer += chunk.toString("utf-8", 0, allowed);
          }
        } else {
          stdoutBuffer += chunk.toString("utf-8");
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderrBuffer.length + chunk.length > bounds.maxBufferBytes) {
          truncated = true;
          const allowed = bounds.maxBufferBytes - stderrBuffer.length;
          if (allowed > 0) {
            stderrBuffer += chunk.toString("utf-8", 0, allowed);
          }
        } else {
          stderrBuffer += chunk.toString("utf-8");
        }
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        if (child.pid) {
          this.activeProcesses.delete(child.pid);
        }
        resolve({
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          exitCode: code,
          signal,
          durationMs: Date.now() - startTime,
          timedOut,
          truncated,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        if (child.pid) {
          this.activeProcesses.delete(child.pid);
        }
        resolve({
          stdout: stdoutBuffer,
          stderr: stderrBuffer + `\nProcess error: ${err.message}`,
          exitCode: -1,
          signal: null,
          durationMs: Date.now() - startTime,
          timedOut,
          truncated,
        });
      });
    });
  }

  public killProcessTree(child: ChildProcess, signal: NodeJS.Signals = "SIGKILL"): void {
    try {
      if (child.pid) {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", child.pid.toString(), "/T", "/F"]);
        } else {
          child.kill(signal);
        }
        this.activeProcesses.delete(child.pid);
      }
    } catch {
      // ignore kill errors
    }
  }

  public getActiveCount(): number {
    return this.activeProcesses.size;
  }

  public terminateAll(): void {
    for (const child of this.activeProcesses.values()) {
      this.killProcessTree(child, "SIGKILL");
    }
    this.activeProcesses.clear();
  }
}
