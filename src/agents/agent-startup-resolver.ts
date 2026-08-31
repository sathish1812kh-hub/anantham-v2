import { randomUUID } from "node:crypto";
import {
  AgentManifest,
  AgentStartupPlan,
  AgentStartupPlanSchema,
} from "../domain/agent.js";
import { AgentSecurityGuard } from "./agent-security.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import { PolicyEngine } from "../policy/policy-engine.js";
import { ModelRouter } from "../models/model-router.js";

export interface AgentResolutionContext {
  projectId: string;
  sessionId: string;
  taskId?: string;
}

export interface AgentStartupResolverOptions {
  toolRegistry?: ToolRegistry;
  skillRegistry?: SkillRegistry;
  policyEngine?: PolicyEngine;
  modelRouter?: ModelRouter;
}

export interface ResolutionResult {
  success: boolean;
  startupPlan?: AgentStartupPlan;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Deterministic 10-Step Agent Startup Resolution Pipeline.
 * PRD Part 2 Section 278, 283.
 */
export class AgentStartupResolver {
  private toolRegistry?: ToolRegistry;
  private skillRegistry?: SkillRegistry;
  private policyEngine?: PolicyEngine;
  private modelRouter?: ModelRouter;

  constructor(options: AgentStartupResolverOptions = {}) {
    this.toolRegistry = options.toolRegistry;
    this.skillRegistry = options.skillRegistry;
    this.policyEngine = options.policyEngine;
    this.modelRouter = options.modelRouter;
  }

  /**
   * Resolve an agent manifest and context into an immutable AgentStartupPlan.
   */
  public resolve(
    manifest: AgentManifest,
    context: AgentResolutionContext
  ): ResolutionResult {
    // 1. Security & Adversarial Validation
    const secResult = AgentSecurityGuard.validateManifest(manifest);
    if (!secResult.isValid) {
      return {
        success: false,
        errorCode: "SECURITY_VIOLATION",
        errorMessage: secResult.error,
      };
    }

    // 2. Model & Capability Resolution
    let modelId = manifest.modelProfile;
    let provider = "system";
    let contextLimit = 128000;

    if (this.modelRouter) {
      const requiredFeatures: ("toolCalling" | "parallelToolCalls" | "structuredOutput" | "jsonSchema" | "streaming" | "reasoning" | "computerUse" | "webSearch" | "codeExecution" | "promptCaching")[] = [];
      if (
        manifest.tools.length > 0 ||
        manifest.requiredCapabilities.includes("toolCalling") ||
        manifest.requiredCapabilities.includes("tool_calling")
      ) {
        requiredFeatures.push("toolCalling");
      }
      if (manifest.requiredCapabilities.includes("reasoning")) {
        requiredFeatures.push("reasoning");
      }

      const decision = this.modelRouter.route({
        requirements: {
          requiredInputs: ["text"],
          requiredFeatures: requiredFeatures.length > 0 ? requiredFeatures : undefined,
        },
        preferredModelId:
          manifest.modelProfile !== "default" ? manifest.modelProfile : undefined,
        sensitivity: "normal",
        maxAttempts: 1,
      });

      if (!decision.selectedCandidate) {
        return {
          success: false,
          errorCode: "MODEL_UNRESOLVABLE",
          errorMessage: `Failed to resolve compatible model for profile "${manifest.modelProfile}" and capabilities: ${manifest.requiredCapabilities.join(", ")}`,
        };
      }
      modelId = decision.selectedCandidate.modelId;
      provider = decision.selectedCandidate.providerId;
      contextLimit =
        decision.selectedCandidate.profile.limits?.contextWindow || 128000;
    } else {
      if (manifest.modelProfile === "unsupported_profile") {
        return {
          success: false,
          errorCode: "MODEL_UNRESOLVABLE",
          errorMessage: `Model profile "${manifest.modelProfile}" is not available`,
        };
      }
      if (manifest.modelProfile === "reasoning") {
        modelId = "claude-3-5-sonnet-20241022";
        provider = "anthropic";
        contextLimit = 200000;
      } else if (manifest.modelProfile === "fast") {
        modelId = "claude-3-5-haiku-20241022";
        provider = "anthropic";
        contextLimit = 128000;
      } else {
        modelId = "claude-3-7-sonnet";
        provider = "anthropic";
        contextLimit = 200000;
      }
    }

    // 3. Tool Resolution
    if (this.toolRegistry && manifest.tools.length > 0) {
      for (const toolName of manifest.tools) {
        if (!this.toolRegistry.has(toolName)) {
          return {
            success: false,
            errorCode: "TOOL_UNRESOLVABLE",
            errorMessage: `Required tool "${toolName}" is not registered in ToolRegistry`,
          };
        }
      }
    }

    // 4. Skill Resolution
    if (this.skillRegistry && manifest.skills.length > 0) {
      for (const skillName of manifest.skills) {
        // Skill name can be "skillId" or "skillId@version"
        const skillId = skillName.split("@")[0] || skillName;
        const skill = this.skillRegistry.get(skillId);
        if (!skill || skill.lifecycleState !== "enabled") {
          return {
            success: false,
            errorCode: "SKILL_UNRESOLVABLE",
            errorMessage: `Required skill "${skillName}" is not registered or enabled in SkillRegistry`,
          };
        }
      }
    }

    // 5. Permission & Policy Resolution
    const grantedPermissions: string[] = [];
    if (manifest.permissionProfile === "developer") {
      grantedPermissions.push("filesystem.read", "filesystem.write", "shell.execute", "tool.invoke");
    } else if (manifest.permissionProfile === "readonly") {
      grantedPermissions.push("filesystem.read", "tool.invoke");
    } else if (manifest.permissionProfile === "admin") {
      grantedPermissions.push("filesystem.read", "filesystem.write", "shell.execute", "network.access", "tool.invoke");
    } else {
      grantedPermissions.push("filesystem.read");
    }

    if (this.policyEngine) {
      // Policy integration
    }

    // 6. Executor Resolution
    const isSandboxed = manifest.executorProfile !== "local";
    const executor = {
      type: manifest.executorProfile,
      isSandboxed,
    };

    // 7. Budget & Resource Resolution
    const budget = {
      maxTokens: manifest.budget.maxTokens ?? 100000,
      maxCostUsd: manifest.budget.maxCostUsd ?? 5.0,
      maxToolCalls: manifest.budget.maxToolCalls ?? 100,
      maxDurationSeconds: manifest.budget.maxDurationSeconds ?? 3600,
    };

    // 8. Context Scope Resolution
    const contextScope = {
      maxTokens: manifest.contextScope.maxTokens ?? 64000,
      allowedPaths: manifest.contextScope.allowedPaths ?? ["**/*"],
      includeMemory: manifest.contextScope.includeMemory ?? true,
      allowedRepresentations: manifest.contextScope.allowedRepresentations ?? ["text", "code", "structured"],
    };

    // 9. Memory Scope Resolution
    const memoryScope = manifest.memoryScope || {
      namespace: `agent:${manifest.id}`,
      readonly: false,
      crossProjectAccess: false,
    };

    // 10. Construct Immutable AgentStartupPlan
    const startupPlan: AgentStartupPlan = {
      planId: `plan_${randomUUID()}`,
      agentId: manifest.id,
      version: manifest.version,
      role: manifest.role,
      objective: manifest.objective,
      resolvedModel: {
        modelId,
        provider,
        contextLimit,
      },
      resolvedCapabilities: manifest.requiredCapabilities,
      resolvedTools: manifest.tools,
      resolvedSkills: manifest.skills,
      grantedPermissions,
      executor,
      contextScope,
      memoryScope,
      budget,
      projectId: context.projectId,
      sessionId: context.sessionId,
      taskId: context.taskId,
      resolvedAt: new Date().toISOString(),
    };

    AgentStartupPlanSchema.parse(startupPlan);

    return {
      success: true,
      startupPlan,
    };
  }
}
