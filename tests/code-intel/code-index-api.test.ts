import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { CodeIndexEngine } from "../../src/code-intel/code-index-engine.js";

describe("PRD-CODE-002: CodeIndex API Interface", () => {
  const testDir = join(process.cwd(), ".test_code_index_api_" + Date.now());
  let index: CodeIndexEngine;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    index = new CodeIndexEngine();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("satisfies all CodeIndex API methods: indexWorkspace, searchText, searchSymbols, findDefinition, findReferences, relatedFiles, getDiagnostics", async () => {
    const mathFile = join(testDir, "math.ts");
    const appFile = join(testDir, "app.ts");

    writeFileSync(
      mathFile,
      `export function calculateSum(a: number, b: number): number {
  return a + b;
}
export const PI_CONSTANT = 3.14159;`
    );

    writeFileSync(
      appFile,
      `import { calculateSum } from "./math";
export function main() {
  const total = calculateSum(10, 20);
  console.log(total);
}`
    );

    await index.indexWorkspace(testDir);

    // 1. searchText
    const textMatches = await index.searchText("calculateSum");
    expect(textMatches.length).toBeGreaterThanOrEqual(2);

    // 2. searchSymbols
    const symbols = await index.searchSymbols("calculateSum");
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols[0].name).toBe("calculateSum");
    expect(symbols[0].kind).toBe("function");

    // 3. findDefinition
    const defs = await index.findDefinition("calculateSum");
    expect(defs.length).toBe(1);
    expect(defs[0].filePath).toContain("math.ts");

    // 4. findReferences
    const refs = await index.findReferences("calculateSum");
    expect(refs.length).toBeGreaterThanOrEqual(1);

    // 5. relatedFiles
    const related = await index.relatedFiles(appFile);
    expect(related.some((f) => f.includes("math.ts"))).toBe(true);

    // 6. getDiagnostics
    const diags = await index.getDiagnostics();
    expect(Array.isArray(diags)).toBe(true);

    // 7. removeFile
    await index.removeFile(mathFile);
    const postRemoveSymbols = await index.searchSymbols("calculateSum");
    expect(postRemoveSymbols.length).toBe(0);
  });
});
