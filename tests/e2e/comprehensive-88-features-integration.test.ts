import { describe, it, expect } from "vitest";

// M1: Durability & Recovery
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { WalCheckpointScheduler } from "../../src/persistence/wal-checkpoint-scheduler.js";

// M2: Code Intelligence & Workspace
import { MultiLanguageAstParser } from "../../src/code-intel/parsers/multi-language-ast-parser.js";
import { TechStackDiscoveryEngine } from "../../src/workspace/tech-stack-discovery.js";

// M3: Execution, Security & Multimodal
import { ToolGatewayOrchestrator } from "../../src/execution/tool-gateway-orchestrator.js";
import { PolicyHierarchyResolver } from "../../src/security/policy-hierarchy-resolver.js";
import { MultimodalContextInjector } from "../../src/multimodal/multimodal-context-injector.js";

// M4: CLI/TUI, Observability, SaaS & REST APIs
import { InteractiveShellEngine } from "../../src/cli/interactive-shell.js";
import { SlashCommandsRegistry } from "../../src/cli/slash-commands-registry.js";
import { TokenCostAccountingEngine } from "../../src/observability/token-cost-accounting.js";
import { ComplianceAuditLogger } from "../../src/observability/compliance-audit-logger.js";
import { TenantIsolationManager } from "../../src/saas/tenant-isolation-manager.js";
import { RbacEngine } from "../../src/saas/rbac-engine.js";
import { GatewayRoutePipeline } from "../../src/api/gateway-route-pipeline.js";

// M5: Evaluation & Benchmarking
import { CoreEvaluationEngine } from "../../src/evaluation/eval-engine.js";
import { MultiDimensionalGrader } from "../../src/evaluation/multi-dimensional-grader.js";

describe("Milestone 6: Comprehensive 88-Feature Cross-Subsystem E2E Integration Suite", () => {
  it("orchestrates an end-to-end mission across all 6 milestone layers", async () => {
    // 1. Layer 1 (M1): Durability & Checkpointing
    const engine = new SqliteEngine(":memory:");
    const walScheduler = new WalCheckpointScheduler(engine, { intervalMs: 10000 });
    walScheduler.start();
    expect(walScheduler.isRunning()).toBe(true);
    walScheduler.stop();
    expect(walScheduler.isRunning()).toBe(false);
    engine.close();

    // 2. Layer 2 (M2): Code Intelligence & Workspace Tech Stack
    const parser = new MultiLanguageAstParser();
    const parsedTs = parser.parse("src/index.ts", "export function orchestrate() { return 42; }");
    expect(parsedTs.symbols.some((s) => s.name === "orchestrate")).toBe(true);

    const techStack = new TechStackDiscoveryEngine().discover(process.cwd());
    expect(techStack.hasGit).toBe(true);
    expect(techStack.packageManager).toBe("npm");

    // 3. Layer 3 (M3): Security Policy Resolution, ToolGateway & Multimodal
    const policyResolver = new PolicyHierarchyResolver();
    const resolvedPolicy = policyResolver.resolveHierarchy([
      { scope: "enterprise", allowNetwork: true, maxRiskLevelWithoutApproval: "execute" },
      { scope: "project", allowedTools: ["view_file", "run_command"] },
      { scope: "session", maxRiskLevelWithoutApproval: "write" },
    ]);
    expect(resolvedPolicy.allowedTools).toEqual(["view_file", "run_command"]);
    expect(resolvedPolicy.maxRiskLevelWithoutApproval).toBe("write");

    const gateway = new ToolGatewayOrchestrator({
      allowedTools: ["view_file", "run_command"],
      blockedTools: [],
      maxRiskLevelWithoutApproval: "write",
      allowNetwork: false,
      allowDestructive: false,
      defaultSandbox: "local_direct",
      globalBounds: { timeoutMs: 5000, maxBufferBytes: 1024 * 1024 },
    });

    const executionResult = await gateway.executeTool(
      {
        id: "exec_1",
        toolName: "view_file",
        action: "view",
        arguments: { path: "src/index.ts" },
        sessionId: "sess_e2e",
        agentId: "agent_orchestrator",
        workspaceRoot: process.cwd(),
      },
      async () => ({ content: "export * from './index.js';" })
    );
    expect(executionResult.success).toBe(true);
    expect(executionResult.riskLevel).toBe("read");

    const mmInjector = new MultimodalContextInjector();
    const mmContext = mmInjector.injectItems(
      [
        {
          id: "img_1",
          kind: "image",
          mimeType: "image/png",
          estimatedTokens: 256,
          dataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP6zwAAAgcBApocMXEAAAAASUVORK5CYII=",
        },
      ],
      "reference"
    );
    expect(mmContext.itemsIncluded).toBe(1);
    expect(mmContext.totalTokens).toBe(256);

    // 4. Layer 4 (M4): CLI, Observability, SaaS & REST Gateway
    const shell = new InteractiveShellEngine();
    const slashRegistry = new SlashCommandsRegistry();
    const parsedCmd = shell.parseCommand("/cost");
    expect(parsedCmd.isSlashCommand).toBe(true);

    const costRes = await slashRegistry.execute(parsedCmd.command, parsedCmd.args, {
      totalTokens: 50000,
      totalCostUsd: 0.125,
    });
    expect(costRes.success).toBe(true);
    expect(costRes.message).toContain("$0.1250");

    const costEngine = new TokenCostAccountingEngine();
    const usage = costEngine.recordUsage("sess_e2e", "gemini-2.5-pro", 10000, 2000);
    expect(usage.currentUsage.costUsd).toBeGreaterThan(0);

    const auditLogger = new ComplianceAuditLogger();
    auditLogger.logEvent("user_lead", "execute_mission", "project_anantham", { status: "success" });
    expect(auditLogger.verifyChainIntegrity().isValid).toBe(true);

    const tenantMgr = new TenantIsolationManager();
    tenantMgr.registerTenant({
      tenantId: "tenant_acme",
      organizationId: "org_acme",
      name: "Acme Corp",
      isolationMode: "schema",
    });
    expect(tenantMgr.validateAccess("tenant_acme", "tenant_acme").allowed).toBe(true);
    expect(tenantMgr.validateAccess("tenant_acme", "tenant_other").allowed).toBe(false);

    const rbac = new RbacEngine();
    expect(rbac.can({ userId: "u1", role: "admin" }, "project:delete")).toBe(true);
    expect(rbac.can({ userId: "u2", role: "viewer" }, "project:delete")).toBe(false);

    const restGateway = new GatewayRoutePipeline();
    restGateway.register("GET", "/api/v2/status", async () => ({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: { status: "all_systems_operational" },
    }));

    const apiResponse = await restGateway.dispatch({
      path: "/api/v2/status",
      method: "GET",
      headers: {},
    });
    expect(apiResponse.statusCode).toBe(200);
    expect(apiResponse.body).toEqual({ status: "all_systems_operational" });

    // 5. Layer 5 (M5): Evaluation & Quality Grading
    const evalEngine = new CoreEvaluationEngine();
    const evalReport = await evalEngine.runBenchmark(
      "E2E-Integrity-Check",
      [{ id: "t1", input: "test", expectedOutput: "TEST" }],
      (s) => s.toUpperCase()
    );
    expect(evalReport.passRate).toBe(1.0);

    const grader = new MultiDimensionalGrader();
    const grade = grader.gradeOutput([
      { name: "Correctness", weight: 0.5, score: 98 },
      { name: "Durability", weight: 0.3, score: 100 },
      { name: "Security", weight: 0.2, score: 95 },
    ]);
    expect(grade.letterGrade).toBe("A");
    expect(grade.passedThreshold).toBe(true);
  });
});
