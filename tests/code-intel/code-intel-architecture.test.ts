import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { CodeIntelOrchestrator } from "../../src/code-intel/code-intel-orchestrator.js";

describe("PRD-CODE-001: Code Intelligence Plane Architecture & Components", () => {
  const testDir = join(process.cwd(), ".test_code_intel_arch_" + Date.now());
  let orchestrator: CodeIntelOrchestrator;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    orchestrator = new CodeIntelOrchestrator();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("coordinates File Scanner, AST Parser, and Symbol Index across workspace", async () => {
    const fileA = join(testDir, "service.ts");
    const fileB = join(testDir, "client.ts");

    writeFileSync(
      fileA,
      `export class DataService {
  public fetchData(): string {
    return "ok";
  }
}`
    );

    writeFileSync(
      fileB,
      `import { DataService } from "./service";
export function runClient() {
  const svc = new DataService();
  return svc.fetchData();
}`
    );

    const { indexedFilesCount } = await orchestrator.scanAndIndexWorkspace(testDir);
    expect(indexedFilesCount).toBeGreaterThanOrEqual(2);

    const symbols = await orchestrator.searchCodeSymbols("DataService");
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols[0].name).toBe("DataService");
    expect(symbols[0].kind).toBe("class");

    const defs = await orchestrator.querySymbolDefinition("DataService");
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0].filePath).toContain("service.ts");

    const refs = await orchestrator.querySymbolReferences("DataService");
    expect(refs.length).toBeGreaterThan(0);
  });

  it("exposes public CodeIndex and MultiLanguageAstParser instances", () => {
    expect(orchestrator.getIndex()).toBeDefined();
    expect(orchestrator.getParser()).toBeDefined();
    expect(orchestrator.getFaultIsolator()).toBeDefined();
  });
});
