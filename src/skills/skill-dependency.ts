/**
 * Anantham V2 — Skill Dependency Resolver
 *
 * Validates required tools, MCP servers, and sub-skill dependencies (with cycle detection).
 */

import { type SkillMetadata } from "../domain/skill.js";
import { type ToolRegistry } from "../tools/tool-registry.js";
import { type MCPRegistry } from "../mcp/mcp-registry.js";

export interface SkillDependencyResolutionResult {
  isResolved: boolean;
  missingTools: string[];
  missingMCP: string[];
  missingSkills: string[];
  cyclicSkills: string[][];
  errors: string[];
}

export class SkillDependencyResolver {
  private readonly toolRegistry?: ToolRegistry;
  private readonly mcpRegistry?: MCPRegistry;

  constructor(options?: { toolRegistry?: ToolRegistry; mcpRegistry?: MCPRegistry }) {
    this.toolRegistry = options?.toolRegistry;
    this.mcpRegistry = options?.mcpRegistry;
  }

  /**
   * Resolves all dependencies for a target skill given the available skills map.
   */
  public resolveDependencies(
    skill: SkillMetadata,
    allSkills: Map<string, SkillMetadata>
  ): SkillDependencyResolutionResult {
    const missingTools: string[] = [];
    const missingMCP: string[] = [];
    const missingSkills: string[] = [];
    const cyclicSkills: string[][] = [];

    // 1. Validate required tools
    if (this.toolRegistry && skill.tools && skill.tools.length > 0) {
      for (const tool of skill.tools) {
        if (!this.toolRegistry.has(tool)) {
          missingTools.push(tool);
        }
      }
    }

    // 2. Validate required MCP servers
    if (this.mcpRegistry && skill.mcp && skill.mcp.length > 0) {
      for (const mcpServer of skill.mcp) {
        const client = this.mcpRegistry.getClient(mcpServer);
        if (!client || client.getHealthStatus() === "disabled" || client.getHealthStatus() === "unhealthy") {
          missingMCP.push(mcpServer);
        }
      }
    }

    // 3. Validate sub-skills & detect cycles
    const visited = new Map<string, "visiting" | "visited">();

    const dfs = (skillId: string, path: string[]) => {
      if (visited.get(skillId) === "visiting") {
        const cycleIndex = path.indexOf(skillId);
        cyclicSkills.push([...path.slice(cycleIndex), skillId]);
        return;
      }
      if (visited.get(skillId) === "visited") return;

      visited.set(skillId, "visiting");
      const target = allSkills.get(skillId);
      if (!target) {
        if (!missingSkills.includes(skillId)) {
          missingSkills.push(skillId);
        }
      } else {
        for (const childSkill of target.skills || []) {
          dfs(childSkill, [...path, skillId]);
        }
      }
      visited.set(skillId, "visited");
    };

    dfs(skill.id, []);

    const errors: string[] = [];
    if (missingTools.length > 0) {
      errors.push(`Missing required tools: ${missingTools.join(", ")}.`);
    }
    if (missingMCP.length > 0) {
      errors.push(`Missing or disconnected required MCP servers: ${missingMCP.join(", ")}.`);
    }
    if (missingSkills.length > 0) {
      errors.push(`Missing required sub-skills: ${missingSkills.join(", ")}.`);
    }
    if (cyclicSkills.length > 0) {
      for (const cycle of cyclicSkills) {
        errors.push(`Cyclic skill dependency detected: ${cycle.join(" -> ")}.`);
      }
    }

    return {
      isResolved: errors.length === 0,
      missingTools,
      missingMCP,
      missingSkills,
      cyclicSkills,
      errors,
    };
  }
}
