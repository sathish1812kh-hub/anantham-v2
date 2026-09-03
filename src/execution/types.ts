/**
 * Execution Engine & ToolGateway Types
 * PRD-EXEC-002, PRD-EXEC-003, PRD-EXEC-004, PRD-EXEC-005, PRD-INV-004
 */

export type ExecutionRiskLevel = "read" | "write" | "execute" | "network" | "destructive";

// Alias for backwards compatibility within execution subsystem
export type ToolRiskLevel = ExecutionRiskLevel;

export type SandboxType = "local_direct" | "local_virtualized" | "container" | "cloud";

export interface ProcessBounds {
  timeoutMs: number;
  maxBufferBytes: number;
  maxMemoryMb?: number;
  killSignal?: NodeJS.Signals;
}

export interface ToolExecutionRequest {
  id: string;
  toolName: string;
  action: string;
  arguments: Record<string, unknown>;
  sessionId: string;
  agentId: string;
  workspaceRoot: string;
  sandboxType?: SandboxType;
  overridingBounds?: Partial<ProcessBounds>;
}

export interface ToolExecutionResult {
  id: string;
  success: boolean;
  toolName: string;
  riskLevel: ExecutionRiskLevel;
  output?: unknown;
  error?: string;
  durationMs: number;
  sandboxType: SandboxType;
  requiresApproval: boolean;
  approvedByUser?: boolean;
  auditRecordId: string;
}

export interface ToolGatewaySecurityPolicy {
  allowedTools: string[];
  blockedTools: string[];
  maxRiskLevelWithoutApproval: ExecutionRiskLevel;
  allowNetwork: boolean;
  allowDestructive: boolean;
  defaultSandbox: SandboxType;
  globalBounds: ProcessBounds;
}
