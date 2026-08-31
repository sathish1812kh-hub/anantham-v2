import { describe, it, expect } from "vitest";
import {
  HookManifestSchema,
  HookRecordSchema,
  HookExecutionResultSchema,
  HookTriggerTypeSchema,
  HookActionTypeSchema,
  HookErrorPolicySchema,
} from "../../src/domain/hook.js";

describe("P5.4 Hooks — Domain Contracts & Runtime Validation", () => {
  it("validates HookTriggerTypeSchema, HookActionTypeSchema, and HookErrorPolicySchema", () => {
    expect(HookTriggerTypeSchema.parse("BeforeTool")).toBe("BeforeTool");
    expect(HookTriggerTypeSchema.parse("BeforePush")).toBe("BeforePush");
    expect(HookActionTypeSchema.parse("command")).toBe("command");
    expect(HookActionTypeSchema.parse("deny")).toBe("deny");
    expect(HookErrorPolicySchema.parse("fail-closed")).toBe("fail-closed");
    expect(HookErrorPolicySchema.parse("fail-open")).toBe("fail-open");
  });

  it("validates HookManifestSchema, HookRecordSchema, and HookExecutionResultSchema accurately", () => {
    const validManifest = HookManifestSchema.parse({
      id: "pre-push-test",
      name: "Pre Push Test",
      version: "1.0.0",
      event: "BeforePush",
      action: {
        type: "command",
        command: "npm test",
      },
      policy: {
        onFailure: "fail-closed",
        timeoutMs: 30000,
        maxRetries: 1,
      },
      priority: 200,
      enabled: true,
      scope: "project",
      projectId: "prj_test",
    });

    expect(validManifest.id).toBe("pre-push-test");
    expect(validManifest.policy.onFailure).toBe("fail-closed");

    const record = HookRecordSchema.parse({
      id: validManifest.id,
      manifest: validManifest,
      lifecycleState: "enabled",
      source: "project",
      registeredAt: new Date().toISOString(),
    });

    expect(record.lifecycleState).toBe("enabled");

    const execResult = HookExecutionResultSchema.parse({
      hookId: "pre-push-test",
      event: "BeforePush",
      actionType: "command",
      success: true,
      decision: "executed",
      durationMs: 150,
      isFailClosedBlocked: false,
      timestamp: new Date().toISOString(),
    });

    expect(execResult.success).toBe(true);
  });
});
