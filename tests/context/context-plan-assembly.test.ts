import { describe, it, expect } from "vitest";
import { ContextEngine } from "../../src/context/context-engine.js";
import { ContextPlanSchema } from "../../src/domain/context.js";

describe("ContextEngine - ContextPlan Assembly", () => {
  it("assembles a valid deterministic ContextPlan adhering to ContextPlanSchema", async () => {
    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      modelProfile: {
        modelId: "gpt-4o",
        supportedModalities: ["text", "image"],
      },
      systemPrompt: "You are the Anantham Core Orchestrator.",
      candidates: [
        {
          id: "ctx_task_01",
          sourceType: "task",
          sourceId: "tsk_01",
          rawContent: "Task: Implement Context Engine",
          priority: "CRITICAL",
          authority: "project-instruction",
          selectedBecause: "Current active task definition",
        },
        {
          id: "ctx_file_01",
          sourceType: "file",
          sourceId: "file_readme",
          rawContent: "# README\nProject documentation",
          priority: "NORMAL",
          authority: "repository-content",
          selectedBecause: "Referenced project README",
        },
      ],
    });

    expect(plan.id).toBeDefined();
    expect(plan.items.length).toBe(3); // System prompt + 2 candidates
    expect(plan.estimatedTokens).toBeGreaterThan(0);
    expect(plan.decisions.length).toBeGreaterThan(0);

    // Strict schema parse assertion
    const validated = ContextPlanSchema.parse(plan);
    expect(validated.id).toBe(plan.id);
  });
});
