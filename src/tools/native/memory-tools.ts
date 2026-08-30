import { type ToolRegistration } from "../tool-registry.js";
import { type MemoryManager } from "../../memory/memory-manager.js";

export interface MemoryToolsOptions {
  memoryManager?: MemoryManager;
}

export function createMemoryTools(options: MemoryToolsOptions = {}): ToolRegistration[] {
  // In-memory fallback if no MemoryManager injected
  const memoryFallback = new Map<string, { namespace: string; key: string; content: string; tags: string[] }>();

  const storeMemoryTool: ToolRegistration = {
    definition: {
      name: "store_memory",
      description: "Store a scoped memory entry within the project memory namespace.",
      parametersSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          key: { type: "string" },
          content: { type: "string" },
          tags: { type: "array" },
        },
        required: ["namespace", "key", "content"],
      },
      isIdempotent: false,
      riskLevel: "medium",
    },
    handler: async (args: any, context) => {
      const memoryKey = `${context.project.id}::${args.namespace}::${args.key}`;

      if (options.memoryManager) {
        const item = await options.memoryManager.saveMemory({
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          projectId: context.project.id,
          scope: "project",
          type: args.namespace,
          content: args.content,
          confidence: 1.0,
          priority: "NORMAL",
          sensitivity: "normal",
          sourceEventIds: [],
          createdAt: new Date().toISOString(),
          tags: args.tags || [],
          metadata: { key: args.key },
        });
        return {
          id: item.id,
          namespace: item.type,
          key: args.key,
          stored: true,
        };
      }

      memoryFallback.set(memoryKey, {
        namespace: args.namespace,
        key: args.key,
        content: args.content,
        tags: args.tags || [],
      });

      return {
        id: `mem_${Date.now()}`,
        namespace: args.namespace,
        key: args.key,
        stored: true,
      };
    },
  };

  const retrieveMemoryTool: ToolRegistration = {
    definition: {
      name: "retrieve_memory",
      description: "Query and retrieve scoped memories matching keywords or namespace.",
      parametersSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["namespace", "query"],
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const limit = args.limit || 10;

      const results = Array.from(memoryFallback.values())
        .filter(
          (m) =>
            m.namespace === args.namespace &&
            (m.key.toLowerCase().includes(String(args.query).toLowerCase()) ||
              m.content.toLowerCase().includes(String(args.query).toLowerCase()))
        )
        .slice(0, limit);

      return {
        namespace: args.namespace,
        query: args.query,
        count: results.length,
        memories: results,
      };
    },
  };

  return [storeMemoryTool, retrieveMemoryTool];
}
