/**
 * Hierarchical Dynamic Security Policy Resolution & Inheritance Engine
 * PRD-SEC-004: Dynamic Security Policy Resolution & Inheritance
 */

import type { ExecutionRiskLevel, SandboxType } from "../execution/types.js";

export type PolicyScope = "enterprise" | "org" | "project" | "session" | "agent";

export interface PolicyLayer {
  scope: PolicyScope;
  allowedTools?: string[];
  blockedTools?: string[];
  maxRiskLevelWithoutApproval?: ExecutionRiskLevel;
  allowNetwork?: boolean;
  allowDestructive?: boolean;
  enforceZeroKnowledge?: boolean;
  allowedSandboxTypes?: SandboxType[];
}

export interface ResolvedPolicy {
  allowedTools: string[];
  blockedTools: string[];
  maxRiskLevelWithoutApproval: ExecutionRiskLevel;
  allowNetwork: boolean;
  allowDestructive: boolean;
  enforceZeroKnowledge: boolean;
  allowedSandboxTypes: SandboxType[];
  hierarchyTrace: Array<{ scope: PolicyScope; tightenedFields: string[] }>;
}

export class PolicyHierarchyResolver {
  private static readonly RISK_ORDER: Record<ExecutionRiskLevel, number> = {
    read: 1,
    write: 2,
    execute: 3,
    network: 4,
    destructive: 5,
  };

  private static readonly SCOPE_PRECEDENCE: PolicyScope[] = [
    "enterprise",
    "org",
    "project",
    "session",
    "agent",
  ];

  public resolveHierarchy(layers: PolicyLayer[]): ResolvedPolicy {
    // Sort layers by precedence: enterprise -> org -> project -> session -> agent
    const sortedLayers = [...layers].sort((a, b) => {
      return (
        PolicyHierarchyResolver.SCOPE_PRECEDENCE.indexOf(a.scope) -
        PolicyHierarchyResolver.SCOPE_PRECEDENCE.indexOf(b.scope)
      );
    });

    // Default base policy (enterprise level baseline)
    let allowedTools = ["*"];
    const blockedTools = new Set<string>();
    let maxRiskLevel: ExecutionRiskLevel = "destructive";
    let allowNetwork: boolean = true;
    let allowDestructive: boolean = true; // Tightened monotonically if any layer sets false
    let enforceZeroKnowledge: boolean = false;
    let allowedSandboxTypes: SandboxType[] = [
      "local_direct",
      "local_virtualized",
      "container",
      "cloud",
    ];

    const hierarchyTrace: Array<{ scope: PolicyScope; tightenedFields: string[] }> = [];

    for (const layer of sortedLayers) {
      const tightenedFields: string[] = [];

      // 1. Blocked tools: UNION of all blocked tools (monotonic restriction)
      if (layer.blockedTools && layer.blockedTools.length > 0) {
        for (const bt of layer.blockedTools) {
          if (!blockedTools.has(bt)) {
            blockedTools.add(bt);
            tightenedFields.push(`blockedTools(+${bt})`);
          }
        }
      }

      // 2. Allowed tools: INTERSECTION (monotonic narrowing)
      if (layer.allowedTools && !layer.allowedTools.includes("*")) {
        if (allowedTools.includes("*")) {
          allowedTools = [...layer.allowedTools];
          tightenedFields.push(`allowedTools(scoped)`);
        } else {
          const narrowed = allowedTools.filter((t) => layer.allowedTools!.includes(t));
          if (narrowed.length < allowedTools.length) {
            allowedTools = narrowed;
            tightenedFields.push(`allowedTools(narrowed)`);
          }
        }
      }

      // 3. Max Risk Level Without Approval: Monotonically strictly lower risk
      if (layer.maxRiskLevelWithoutApproval) {
        if (
          PolicyHierarchyResolver.RISK_ORDER[layer.maxRiskLevelWithoutApproval] <
          PolicyHierarchyResolver.RISK_ORDER[maxRiskLevel]
        ) {
          maxRiskLevel = layer.maxRiskLevelWithoutApproval;
          tightenedFields.push(`maxRiskLevel(${maxRiskLevel})`);
        }
      }

      // 4. Allow Network: Monotonically false (if any parent or child bans network, it stays banned)
      if (layer.allowNetwork === false && allowNetwork) {
        allowNetwork = false;
        tightenedFields.push("allowNetwork(false)");
      }

      // 5. Allow Destructive: Monotonically false
      if (layer.allowDestructive === false && allowDestructive) {
        allowDestructive = false;
        tightenedFields.push("allowDestructive(false)");
      }

      // 6. Zero Knowledge: Monotonically true (if any layer enforces ZK, all must adhere)
      if (layer.enforceZeroKnowledge === true && !enforceZeroKnowledge) {
        enforceZeroKnowledge = true;
        tightenedFields.push("enforceZeroKnowledge(true)");
      }

      // 7. Allowed Sandbox Types: INTERSECTION
      if (layer.allowedSandboxTypes) {
        const narrowed = allowedSandboxTypes.filter((st) => layer.allowedSandboxTypes!.includes(st));
        if (narrowed.length < allowedSandboxTypes.length) {
          allowedSandboxTypes = narrowed;
          tightenedFields.push("allowedSandboxTypes(narrowed)");
        }
      }

      hierarchyTrace.push({ scope: layer.scope, tightenedFields });
    }

    return {
      allowedTools,
      blockedTools: Array.from(blockedTools),
      maxRiskLevelWithoutApproval: maxRiskLevel,
      allowNetwork,
      allowDestructive,
      enforceZeroKnowledge,
      allowedSandboxTypes,
      hierarchyTrace,
    };
  }
}
