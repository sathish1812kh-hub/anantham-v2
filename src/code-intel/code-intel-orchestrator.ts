/**
 * Code Intelligence Plane Orchestrator
 * PRD-CODE-001: Code Intelligence Plane Architecture & Components
 */

import { CodeIndexEngine } from "./code-index-engine.js";
import { MultiLanguageAstParser } from "./parsers/multi-language-ast-parser.js";
import { CodeIntelFaultIsolator } from "./fault-isolator.js";
import type { CodeIndex, ParseResult, CodeLocation, CodeSymbol, IndexQueryOptions } from "./types.js";

export class CodeIntelOrchestrator {
  private indexEngine: CodeIndexEngine;
  private parser: MultiLanguageAstParser;
  private faultIsolator: CodeIntelFaultIsolator;

  constructor(options: { indexEngine?: CodeIndexEngine; faultIsolator?: CodeIntelFaultIsolator } = {}) {
    this.faultIsolator = options.faultIsolator ?? new CodeIntelFaultIsolator();
    this.indexEngine = options.indexEngine ?? new CodeIndexEngine({ faultIsolator: this.faultIsolator });
    this.parser = new MultiLanguageAstParser();
  }

  public getIndex(): CodeIndex {
    return this.indexEngine;
  }

  public getParser(): MultiLanguageAstParser {
    return this.parser;
  }

  public getFaultIsolator(): CodeIntelFaultIsolator {
    return this.faultIsolator;
  }

  public async scanAndIndexWorkspace(workspacePath: string): Promise<{ indexedFilesCount: number }> {
    await this.indexEngine.indexWorkspace(workspacePath);
    const symbols = await this.indexEngine.searchSymbols("", { limit: 100000 });
    const uniqueFiles = new Set(symbols.map((s) => s.filePath));
    return { indexedFilesCount: uniqueFiles.size };
  }

  public async inspectFile(filePath: string, content?: string): Promise<ParseResult> {
    return this.indexEngine.indexFile(filePath, content);
  }

  public async querySymbolDefinition(symbolName: string, contextPath?: string): Promise<CodeLocation[]> {
    return this.indexEngine.findDefinition(symbolName, contextPath);
  }

  public async querySymbolReferences(symbolName: string): Promise<CodeLocation[]> {
    return this.indexEngine.findReferences(symbolName);
  }

  public async searchCodeSymbols(query: string, options?: IndexQueryOptions): Promise<CodeSymbol[]> {
    return this.indexEngine.searchSymbols(query, options);
  }
}
