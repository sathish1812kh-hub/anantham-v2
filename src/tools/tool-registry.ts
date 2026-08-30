import {
  type ToolSpec,
  ToolSpecSchema,
} from "../domain/tool.js";
import type { ActorType } from "../domain/event.js";

export interface ToolExecutionContext {
  callId: string;
  actor: { id: string; type: ActorType; role?: string };
  project: { id: string };
  session?: { id: string };
  task?: { id: string };
  signal?: AbortSignal;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<unknown>;

export interface ToolRegistration {
  definition: ToolSpec;
  handler: ToolHandler;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolRegistration>();

  /**
   * Registers a tool with its authoritative definition and execution handler.
   */
  public register(registration: ToolRegistration): void {
    const validatedDef = ToolSpecSchema.parse(registration.definition);
    const name = validatedDef.name;

    if (this.tools.has(name)) {
      throw new Error(`Tool with name "${name}" is already registered.`);
    }

    if (typeof registration.handler !== "function") {
      throw new Error(`Tool "${name}" must have a valid handler function.`);
    }

    this.tools.set(name, {
      definition: validatedDef,
      handler: registration.handler,
    });
  }

  public get(name: string): ToolRegistration | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public list(): ToolRegistration[] {
    return Array.from(this.tools.values());
  }

  public unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  public clear(): void {
    this.tools.clear();
  }
}
