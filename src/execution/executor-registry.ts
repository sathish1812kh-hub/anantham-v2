import {
  type ExecutorType,
  type ExecutionRequest,
  type ExecutionResult,
  ExecutionRequestSchema,
} from "../domain/execution.js";
import { LocalExecutor } from "./local-executor.js";
import { DockerSandboxExecutor } from "./docker-sandbox-executor.js";
import { RemoteExecutor } from "./remote-executor.js";
import { ProcessSupervisor } from "./process-supervisor.js";

export interface ExecutorInstance {
  type: ExecutorType;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}

export class ExecutorRegistry {
  private readonly executors = new Map<ExecutorType, ExecutorInstance>();
  private readonly supervisor: ProcessSupervisor;

  constructor(options: { supervisor?: ProcessSupervisor } = {}) {
    this.supervisor = options.supervisor || new ProcessSupervisor();
    this.register(new LocalExecutor({ supervisor: this.supervisor }));
    this.register(new DockerSandboxExecutor({ supervisor: this.supervisor }));
    this.register(new RemoteExecutor());
  }

  public register(executor: ExecutorInstance): void {
    this.executors.set(executor.type, executor);
  }

  public get(type: ExecutorType): ExecutorInstance {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`Executor of type "${type}" is not registered.`);
    }
    return executor;
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const validated = ExecutionRequestSchema.parse(request);
    const executorType = validated.executorType || "local";
    const executor = this.get(executorType);
    return executor.execute(validated);
  }

  public getSupervisor(): ProcessSupervisor {
    return this.supervisor;
  }
}
