/**
 * Sandbox Execution & Isolation Manager
 * PRD-EXEC-004: Execution Isolation & Sandboxing
 * PRD-INV-004: Sandbox Isolation & Tool Integrity Invariants
 */

import { resolve, relative } from "node:path";
import type { SandboxType, ToolExecutionRequest } from "./types.js";

export interface SandboxEnvironment {
  type: SandboxType;
  workspaceRoot: string;
  allowedPaths: string[];
  isNetworkAllowed: boolean;
  validatePath(targetPath: string): { allowed: boolean; reason?: string };
}

export class LocalDirectSandbox implements SandboxEnvironment {
  public type: SandboxType = "local_direct";
  public workspaceRoot: string;
  public allowedPaths: string[];
  public isNetworkAllowed: boolean;

  constructor(workspaceRoot: string, allowedPaths: string[] = [], isNetworkAllowed = true) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.allowedPaths = [this.workspaceRoot, ...allowedPaths.map((p) => resolve(p))];
    this.isNetworkAllowed = isNetworkAllowed;
  }

  public validatePath(targetPath: string): { allowed: boolean; reason?: string } {
    const absTarget = resolve(this.workspaceRoot, targetPath);
    for (const allowed of this.allowedPaths) {
      const rel = relative(allowed.toLowerCase(), absTarget.toLowerCase());
      if (!rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\")) {
        return { allowed: true };
      }
    }
    return {
      allowed: false,
      reason: `Path '${targetPath}' escapes allowed sandbox directories`,
    };
  }
}

export class SandboxManager {
  private activeSandboxes: Map<string, SandboxEnvironment> = new Map(); // sessionId -> sandbox

  public createSandbox(
    sessionId: string,
    type: SandboxType,
    workspaceRoot: string,
    options: { allowedPaths?: string[]; isNetworkAllowed?: boolean } = {}
  ): SandboxEnvironment {
    let sandbox: SandboxEnvironment;

    switch (type) {
      case "local_direct":
      case "local_virtualized":
      case "container":
      case "cloud":
      default:
        sandbox = new LocalDirectSandbox(
          workspaceRoot,
          options.allowedPaths,
          options.isNetworkAllowed ?? true
        );
        sandbox.type = type;
        break;
    }

    this.activeSandboxes.set(sessionId, sandbox);
    return sandbox;
  }

  public getSandbox(sessionId: string): SandboxEnvironment | undefined {
    return this.activeSandboxes.get(sessionId);
  }

  public enforceSandboxBoundaries(
    sandbox: SandboxEnvironment,
    request: ToolExecutionRequest
  ): { allowed: boolean; reason?: string } {
    // 1. Path isolation check for write/read file targets
    const targetFile =
      (request.arguments.TargetFile as string) ||
      (request.arguments.AbsolutePath as string) ||
      (request.arguments.filePath as string) ||
      (request.arguments.path as string);

    if (targetFile) {
      const pathValidation = sandbox.validatePath(targetFile);
      if (!pathValidation.allowed) {
        return pathValidation;
      }
    }

    // 2. Network isolation check
    if (!sandbox.isNetworkAllowed) {
      const tool = request.toolName.toLowerCase();
      if (
        ["read_url_content", "search_web", "fetch", "curl", "wget"].includes(tool) ||
        (request.arguments.CommandLine &&
          /\b(curl|wget|ping|ssh|scp|nc)\b/i.test(String(request.arguments.CommandLine)))
      ) {
        return {
          allowed: false,
          reason: `Network access is disabled for this sandbox environment`,
        };
      }
    }

    return { allowed: true };
  }
}
