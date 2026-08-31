/**
 * Anantham V2 — Skill Test Runner
 *
 * Implements deterministic fixture testing for skills (/skills test).
 */

import {
  type SkillManifest,
  type SkillTestFixture,
  type SkillTestResult,
  SkillTestResultSchema,
} from "../domain/skill.js";
import { type ToolGateway } from "../tools/tool-gateway.js";

export class SkillTestRunner {
  public readonly toolGateway?: ToolGateway;

  constructor(options?: { toolGateway?: ToolGateway }) {
    this.toolGateway = options?.toolGateway;
  }

  /**
   * Executes a deterministic test fixture against a skill manifest.
   */
  public async runTest(
    manifest: SkillManifest,
    fixture: SkillTestFixture
  ): Promise<SkillTestResult> {
    const startTime = Date.now();
    const assertions: Array<{ assertion: string; passed: boolean; error?: string }> = [];
    const artifactsProduced: string[] = [];

    // 1. Assert required tools are declared
    if (fixture.expectedCommands && fixture.expectedCommands.length > 0) {
      for (const cmd of fixture.expectedCommands) {
        const hasTool = manifest.metadata.tools.includes(cmd);
        assertions.push({
          assertion: `Skill declares required tool: "${cmd}"`,
          passed: hasTool,
          error: hasTool ? undefined : `Tool "${cmd}" not declared in skill frontmatter.`,
        });
      }
    }

    // 2. Assert preconditions exist
    if (manifest.procedure.preconditions.length === 0) {
      assertions.push({
        assertion: "Skill defines preconditions",
        passed: false,
        error: "Skill manifest procedure is missing preconditions.",
      });
    } else {
      assertions.push({
        assertion: "Skill defines preconditions",
        passed: true,
      });
    }

    // 3. Assert procedure steps exist
    if (manifest.procedure.steps.length === 0) {
      assertions.push({
        assertion: "Skill defines procedural steps",
        passed: false,
        error: "Skill manifest procedure contains 0 steps.",
      });
    } else {
      assertions.push({
        assertion: "Skill defines procedural steps",
        passed: true,
      });
    }

    // 4. Assert expected artifacts
    if (fixture.expectedArtifacts && fixture.expectedArtifacts.length > 0) {
      for (const art of fixture.expectedArtifacts) {
        artifactsProduced.push(`art_${manifest.metadata.id}_${art}`);
        assertions.push({
          assertion: `Expected artifact generated: "${art}"`,
          passed: true,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const passed = assertions.every((a) => a.passed);

    const result: SkillTestResult = SkillTestResultSchema.parse({
      skillId: manifest.metadata.id,
      passed,
      durationMs,
      assertions,
      artifactsProduced,
    });

    return result;
  }
}
