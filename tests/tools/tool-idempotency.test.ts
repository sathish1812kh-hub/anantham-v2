import { describe, it, expect } from "vitest";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { IdempotencyStore } from "../../src/tools/idempotency-store.js";

describe("P4.2 Tool Gateway — Idempotency & Deduplication", () => {
  it("caches idempotent tool result and avoids re-executing handler on duplicate key", async () => {
    const registry = new ToolRegistry();
    const idempotencyStore = new IdempotencyStore();
    let handlerExecutions = 0;

    registry.register({
      definition: {
        name: "compute_hash",
        parametersSchema: { properties: { data: { type: "string" } } },
        isIdempotent: true,
      },
      handler: async (args) => {
        handlerExecutions++;
        return `hash_of_${args.data}`;
      },
    });

    const gateway = new ToolGateway({ registry, idempotencyStore });

    // Call 1
    const obs1 = await gateway.invoke({
      callId: "call_1",
      toolName: "compute_hash",
      arguments: { data: "sample" },
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
      idempotencyKey: "key_idem_001",
    });

    expect(handlerExecutions).toBe(1);
    expect(obs1.status).toBe("success");
    expect(obs1.result).toBe("hash_of_sample");
    expect(obs1.fromCache).toBeUndefined();

    // Call 2 with identical idempotencyKey
    const obs2 = await gateway.invoke({
      callId: "call_2",
      toolName: "compute_hash",
      arguments: { data: "sample" },
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
      idempotencyKey: "key_idem_001",
    });

    expect(handlerExecutions).toBe(1); // Handler was not re-run!
    expect(obs2.status).toBe("success");
    expect(obs2.result).toBe("hash_of_sample");
    expect(obs2.fromCache).toBe(true);
  });

  it("does not cache non-idempotent tool results even if key is supplied", async () => {
    const registry = new ToolRegistry();
    const idempotencyStore = new IdempotencyStore();
    let handlerExecutions = 0;

    registry.register({
      definition: {
        name: "send_message",
        parametersSchema: {},
        isIdempotent: false,
      },
      handler: async () => {
        handlerExecutions++;
        return `sent_${handlerExecutions}`;
      },
    });

    const gateway = new ToolGateway({ registry, idempotencyStore });

    await gateway.invoke({
      callId: "call_a",
      toolName: "send_message",
      arguments: {},
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
      idempotencyKey: "key_msg_1",
    });

    await gateway.invoke({
      callId: "call_b",
      toolName: "send_message",
      arguments: {},
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
      idempotencyKey: "key_msg_1",
    });

    expect(handlerExecutions).toBe(2);
  });
});
