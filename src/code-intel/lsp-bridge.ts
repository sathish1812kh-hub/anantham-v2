/**
 * LSP Client Bridge Integration
 * PRD-CODE-004: LSP Client Bridge Integration
 */

import type { CodeLocation, CodePosition, CodeDiagnostic } from "./types.js";

export interface LspClientOptions {
  serverCommand?: string;
  serverArgs?: string[];
  rootUri?: string;
  mockHandler?: (method: string, params: unknown) => Promise<unknown> | unknown;
}

export interface LspHoverResult {
  contents: string;
  range?: {
    start: CodePosition;
    end: CodePosition;
  };
}

export interface LspSymbolInformation {
  name: string;
  kind: number;
  location: CodeLocation;
  containerName?: string;
}

export class LspClientBridge {
  private isInitialized = false;
  private mockHandler?: (method: string, params: unknown) => Promise<unknown> | unknown;
  private rootUri: string;

  constructor(options: LspClientOptions = {}) {
    this.mockHandler = options.mockHandler;
    this.rootUri = options.rootUri ?? "file:///";
  }

  public async initialize(): Promise<boolean> {
    if (this.mockHandler) {
      await this.mockHandler("initialize", { rootUri: this.rootUri });
    }
    this.isInitialized = true;
    return true;
  }

  public async getDefinition(filePath: string, position: CodePosition): Promise<CodeLocation[]> {
    this.ensureInitialized();
    if (this.mockHandler) {
      const res = (await this.mockHandler("textDocument/definition", {
        textDocument: { uri: `file://${filePath}` },
        position: { line: position.line - 1, character: position.character - 1 },
      })) as CodeLocation[];
      return res ?? [];
    }
    return [];
  }

  public async getReferences(filePath: string, position: CodePosition): Promise<CodeLocation[]> {
    this.ensureInitialized();
    if (this.mockHandler) {
      const res = (await this.mockHandler("textDocument/references", {
        textDocument: { uri: `file://${filePath}` },
        position: { line: position.line - 1, character: position.character - 1 },
        context: { includeDeclaration: true },
      })) as CodeLocation[];
      return res ?? [];
    }
    return [];
  }

  public async getHover(filePath: string, position: CodePosition): Promise<LspHoverResult | null> {
    this.ensureInitialized();
    if (this.mockHandler) {
      const res = (await this.mockHandler("textDocument/hover", {
        textDocument: { uri: `file://${filePath}` },
        position: { line: position.line - 1, character: position.character - 1 },
      })) as LspHoverResult;
      return res ?? null;
    }
    return null;
  }

  public async getDocumentSymbols(filePath: string): Promise<LspSymbolInformation[]> {
    this.ensureInitialized();
    if (this.mockHandler) {
      const res = (await this.mockHandler("textDocument/documentSymbol", {
        textDocument: { uri: `file://${filePath}` },
      })) as LspSymbolInformation[];
      return res ?? [];
    }
    return [];
  }

  public async getWorkspaceSymbols(query: string): Promise<LspSymbolInformation[]> {
    this.ensureInitialized();
    if (this.mockHandler) {
      const res = (await this.mockHandler("workspace/symbol", { query })) as LspSymbolInformation[];
      return res ?? [];
    }
    return [];
  }

  public async rename(filePath: string, position: CodePosition, newName: string): Promise<{ changes: Record<string, string[]> }> {
    this.ensureInitialized();
    if (this.mockHandler) {
      const res = (await this.mockHandler("textDocument/rename", {
        textDocument: { uri: `file://${filePath}` },
        position: { line: position.line - 1, character: position.character - 1 },
        newName,
      })) as { changes: Record<string, string[]> };
      return res ?? { changes: {} };
    }
    return { changes: {} };
  }

  public async getDiagnostics(filePath: string): Promise<CodeDiagnostic[]> {
    this.ensureInitialized();
    if (this.mockHandler) {
      const res = (await this.mockHandler("textDocument/diagnostics", {
        textDocument: { uri: `file://${filePath}` },
      })) as CodeDiagnostic[];
      return res ?? [];
    }
    return [];
  }

  public shutdown(): void {
    this.isInitialized = false;
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("LspClientBridge must be initialized before making requests.");
    }
  }
}
