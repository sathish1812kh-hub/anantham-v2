import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolGateway } from "../../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../../src/tools/tool-registry.js";
import { IdempotencyStore } from "../../../src/tools/idempotency-store.js";
import { registerNativeTools } from "../../../src/tools/native/register-native-tools.js";

describe("P4.3 Native Tools — Concurrency & Parallel Invocations", () => {
  let tempDir: string;
  let registry: ToolRegistry;
  let idempotencyStore: IdempotencyStore;
  let gateway: ToolGateway;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham_conc_native_"));
    registry = new ToolRegistry();
    registerNativeTools(registry, { projectRoot: tempDir });
    idempotencyStore = new IdempotencyStore();
    gateway = new ToolGateway({ registry, idempotencyStore });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("handles concurrent parallel reads across different project files without interference", async () => {
    fs.writeFileSync(path.join(tempDir, "file1.txt"), "content 1");
    fs.writeFileSync(path.join(tempDir, "file2.txt"), "content 2");
    fs.writeFileSync(path.join(tempDir, "file3.txt"), "content 3");

    const [r1, r2, r3] = await Promise.all([
      gateway.invoke({
        callId: "c1",
        toolName: "read_file",
        arguments: { path: "file1.txt" },
        actor: { id: "agent_1", type: "agent" },
        project: { id: "prj_test" },
      }),
      gateway.invoke({
        callId: "c2",
        toolName: "read_file",
        arguments: { path: "file2.txt" },
        actor: { id: "agent_2", type: "agent" },
        project: { id: "prj_test" },
      }),
      gateway.invoke({
        callId: "c3",
        toolName: "read_file",
        arguments: { path: "file3.txt" },
        actor: { id: "agent_3", type: "agent" },
        project: { id: "prj_test" },
      }),
    ]);

    expect(r1.status).toBe("success");
    expect((r1.result as any).content).toBe("content 1");
    expect(r2.status).toBe("success");
    expect((r2.result as any).content).toBe("content 2");
    expect(r3.status).toBe("success");
    expect((r3.result as any).content).toBe("content 3");
  });
});
