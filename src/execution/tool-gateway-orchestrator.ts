/**
 * ToolGateway Execution Engine Orchestrator
 * PRD-EXEC-002: Execution Engine Architecture
 * PRD-INV-004: Sandbox Isolation & Tool Integrity Invariants
 */

import { randomUUID } from "node:crypto";
import type {
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolGatewaySecurityPolicy,
  ExecutionRiskLevel,
} from "./types.js";
import { ToolRiskClassifier } from "./risk-classifier.js";
import { SandboxManager } from "./sandbox-manager.js";
import { ProcessBoundsManager } from "./process-bounds-manager.js";

export class ToolGatewayOrchestrator {
  private riskClassifier: ToolRiskClassifier;
  private sandboxManager: SandboxManager;
  private processBoundsManager: ProcessBoundsManager;
  private policy: ToolGatewaySecurityPolicy;
  private auditLog: ToolExecutionResult[] = [];

  constructor(options: {
    policy?: Partial<ToolGatewaySecurityPolicy>;
    riskClassifier?: ToolRiskClassifier;
    sandboxManager?: SandboxManager;
    processBoundsManager?: ProcessBoundsManager;
  } = {}) {
    this.riskClassifier = options.riskClassifier ?? new ToolRiskClassifier();
    this.sandboxManager = options.sandboxManager ?? new SandboxManager();
    this.processBoundsManager = options.processBoundsManager ?? new ProcessBoundsManager();

    this.policy = {
      allowedTools: options.policy?.allowedTools ?? ["*"],
      blockedTools: options.policy?.blockedTools ?? [],
      maxRiskLevelWithoutApproval: options.policy?.maxRiskLevelWithoutApproval ?? "read",
      allowNetwork: options.policy?.allowNetwork ?? true,
      allowDestructive: options.policy?.allowDestructive ?? false,
      defaultSandbox: options.policy?.defaultSandbox ?? "local_direct",
      globalBounds: {
        timeoutMs: 30000,
        maxBufferBytes: 5 * 1024 * 1024,
        ...options.policy?.globalBounds,
      },
    };
  }

  public getRiskClassifier(): ToolRiskClassifier {
    return this.riskClassifier;
  }

  public getSandboxManager(): SandboxManager {
    return this.sandboxManager;
  }

  public getProcessBoundsManager(): ProcessBoundsManager {
    return this.processBoundsManager;
  }

  public getAuditLog(): ToolExecutionResult[] {
    return [...this.auditLog];
  }

  public async executeTool(
    request: ToolExecutionRequest,
    executor: (req: ToolExecutionRequest) => Promise<unknown> | unknown,
    userApproved = false
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const auditRecordId = randomUUID();
    const tool = request.toolName;

    // 1. Tool allowlist / blocklist check
    if (this.policy.blockedTools.includes(tool)) {
      const result: ToolExecutionResult = {
        id: request.id,
        success: false,
        toolName: tool,
        riskLevel: "destructive",
        error: `Tool '${tool}' is explicitly blocked by ToolGateway policy`,
        durationMs: Date.now() - startTime,
        sandboxType: request.sandboxType ?? this.policy.defaultSandbox,
        requiresApproval: true,
        auditRecordId,
      };
      this.auditLog.push(result);
      return result;
    }

    // 2. Risk classification
    const riskLevel: ExecutionRiskLevel = this.riskClassifier.classifyRequest(request);

    // 3. Approval check
    const requiresApproval = this.riskClassifier.requiresUserApproval(
      riskLevel,
      this.policy.maxRiskLevelWithoutApproval
    );

    if (requiresApproval && !userApproved) {
      const result: ToolExecutionResult = {
        id: request.id,
        success: false,
        toolName: tool,
        riskLevel,
        error: `Tool execution requires user approval (risk level '${riskLevel}' exceeds threshold '${this.policy.maxRiskLevelWithoutApproval}')`,
        durationMs: Date.now() - startTime,
        sandboxType: request.sandboxType ?? this.policy.defaultSandbox,
        requiresApproval: true,
        approvedByUser: false,
        auditRecordId,
      };
      this.auditLog.push(result);
      return result;
    }

    // 4. Sandbox boundary enforcement
    const sandbox =
      this.sandboxManager.getSandbox(request.sessionId) ??
      this.sandboxManager.createSandbox(
        request.sessionId,
        request.sandboxType ?? this.policy.defaultSandbox,
        request.workspaceRoot,
        { isNetworkAllowed: this.policy.allowNetwork }
      );

    const boundaryCheck = this.sandboxManager.enforceSandboxBoundaries(sandbox, request);
    if (!boundaryCheck.allowed) {
      const result: ToolExecutionResult = {
        id: request.id,
        success: false,
        toolName: tool,
        riskLevel,
        error: `Sandbox violation: ${boundaryCheck.reason}`,
        durationMs: Date.now() - startTime,
        sandboxType: sandbox.type,
        requiresApproval,
        approvedByUser: userApproved,
        auditRecordId,
      };
      this.auditLog.push(result);
      return result;
    }

    // 5. Execution under sandbox
    try {
      const output = await executor(request);
      const result: ToolExecutionResult = {
        id: request.id,
        success: true,
        toolName: tool,
        riskLevel,
        output,
        durationMs: Date.now() - startTime,
        sandboxType: sandbox.type,
        requiresApproval,
        approvedByUser: userApproved,
        auditRecordId,
      };
      this.auditLog.push(result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const result: ToolExecutionResult = {
        id: request.id,
        success: false,
        toolName: tool,
        riskLevel,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        sandboxType: sandbox.type,
        requiresApproval,
        approvedByUser: userApproved,
        auditRecordId,
      };
      this.auditLog.push(result);
      return result;
    }
  }
}
