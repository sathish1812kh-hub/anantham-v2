import { describe, it, expect } from "vitest";
import { LspClientBridge } from "../../src/code-intel/lsp-bridge.js";

describe("PRD-CODE-004: LSP Client Bridge Integration", () => {
  it("initializes and handles LSP protocol operations: definition, references, hover, symbols, rename, diagnostics", async () => {
    const bridge = new LspClientBridge({
      mockHandler: async (method: string, params: any) => {
        switch (method) {
          case "initialize":
            return { capabilities: { hoverProvider: true, definitionProvider: true } };
          case "textDocument/definition":
            return [{ filePath: "/src/types.ts", range: { start: { line: 10, character: 1 }, end: { line: 10, character: 15 } } }];
          case "textDocument/references":
            return [
              { filePath: "/src/app.ts", range: { start: { line: 5, character: 8 }, end: { line: 5, character: 22 } } },
              { filePath: "/src/index.ts", range: { start: { line: 2, character: 1 }, end: { line: 2, character: 15 } } },
            ];
          case "textDocument/hover":
            return { contents: "interface ProjectConfig: core configuration options" };
          case "textDocument/documentSymbol":
            return [
              {
                name: "ProjectConfig",
                kind: 11,
                location: { filePath: "/src/types.ts", range: { start: { line: 10, character: 1 }, end: { line: 20, character: 1 } } },
              },
            ];
          case "workspace/symbol":
            return [
              {
                name: "ProjectConfig",
                kind: 11,
                location: { filePath: "/src/types.ts", range: { start: { line: 10, character: 1 }, end: { line: 20, character: 1 } } },
              },
            ];
          case "textDocument/rename":
            return { changes: { "/src/types.ts": ["line 10"], "/src/app.ts": ["line 5"] } };
          case "textDocument/diagnostics":
            return [
              {
                filePath: "/src/app.ts",
                range: { start: { line: 5, character: 1 }, end: { line: 5, character: 10 } },
                message: "Unused variable",
                severity: "warning",
              },
            ];
          default:
            return null;
        }
      },
    });

    // Must initialize first
    await expect(bridge.getDefinition("/src/app.ts", { line: 5, character: 10 })).rejects.toThrow(
      "must be initialized"
    );

    const initSuccess = await bridge.initialize();
    expect(initSuccess).toBe(true);

    // 1. Definition
    const defs = await bridge.getDefinition("/src/app.ts", { line: 5, character: 10 });
    expect(defs.length).toBe(1);
    expect(defs[0].filePath).toBe("/src/types.ts");

    // 2. References
    const refs = await bridge.getReferences("/src/types.ts", { line: 10, character: 5 });
    expect(refs.length).toBe(2);

    // 3. Hover
    const hover = await bridge.getHover("/src/types.ts", { line: 10, character: 5 });
    expect(hover?.contents).toContain("ProjectConfig");

    // 4. Document Symbols
    const docSymbols = await bridge.getDocumentSymbols("/src/types.ts");
    expect(docSymbols.length).toBe(1);
    expect(docSymbols[0].name).toBe("ProjectConfig");

    // 5. Workspace Symbols
    const wsSymbols = await bridge.getWorkspaceSymbols("Project");
    expect(wsSymbols.length).toBe(1);

    // 6. Rename
    const renameRes = await bridge.rename("/src/types.ts", { line: 10, character: 5 }, "AppConfig");
    expect(renameRes.changes["/src/types.ts"]).toBeDefined();

    // 7. Diagnostics
    const diags = await bridge.getDiagnostics("/src/app.ts");
    expect(diags.length).toBe(1);
    expect(diags[0].message).toBe("Unused variable");

    bridge.shutdown();
  });
});
