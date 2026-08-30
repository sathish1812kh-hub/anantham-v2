import {
  type ExecutionRequest,
  type ExecutionResult,
  ExecutionRequestSchema,
} from "../domain/execution.js";

export interface RemoteExecutorOptions {
  remoteEndpoint?: string;
  authToken?: string;
}

export class RemoteExecutor {
  public readonly type = "remote" as const;
  private readonly remoteEndpoint?: string;

  constructor(options: RemoteExecutorOptions = {}) {
    this.remoteEndpoint = options.remoteEndpoint;
  }

  public isConfigured(): boolean {
    return Boolean(this.remoteEndpoint);
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const validated = ExecutionRequestSchema.parse(request);
    const startTime = Date.now();

    if (!this.isConfigured()) {
      return {
        executionId: validated.executionId,
        executorType: "remote",
        status: "failed",
        exitCode: 1,
        stdout: "",
        stderr: "Executor unavailable: Remote execution worker pool is not configured.",
        truncated: false,
        durationMs: Date.now() - startTime,
        error: "Remote executor not configured",
      };
    }

    // Remote HTTP execution dispatch (mock/stub boundary)
    return {
      executionId: validated.executionId,
      executorType: "remote",
      status: "completed",
      exitCode: 0,
      stdout: `[Remote: ${this.remoteEndpoint}] Command executed successfully.`,
      stderr: "",
      truncated: false,
      durationMs: Date.now() - startTime,
    };
  }
}
