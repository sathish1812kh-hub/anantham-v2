/**
 * Code Intelligence Subsystem Types & Contracts
 * PRD-CODE-001 / PRD-CODE-002 / PRD-CODE-003 / PRD-INV-001
 */

export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "c"
  | "cpp"
  | "json"
  | "yaml"
  | "markdown"
  | "unknown";

export type SymbolKind =
  | "file"
  | "module"
  | "namespace"
  | "package"
  | "class"
  | "method"
  | "property"
  | "field"
  | "constructor"
  | "enum"
  | "interface"
  | "function"
  | "variable"
  | "constant"
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "key"
  | "typeParameter";

export interface CodePosition {
  line: number; // 1-based
  character: number; // 1-based
}

export interface CodeRange {
  start: CodePosition;
  end: CodePosition;
}

export interface CodeLocation {
  filePath: string;
  range: CodeRange;
}

export interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  language: SupportedLanguage;
  filePath: string;
  range: CodeRange;
  selectionRange?: CodeRange;
  containerName?: string;
  detail?: string;
  documentation?: string;
  children?: CodeSymbol[];
}

export interface ImportDeclaration {
  source: string;
  specifiers: Array<{
    name: string;
    alias?: string;
    isDefault?: boolean;
    isNamespace?: boolean;
  }>;
  range: CodeRange;
}

export interface ExportDeclaration {
  name: string;
  alias?: string;
  isDefault?: boolean;
  range: CodeRange;
}

export interface CallReference {
  callerSymbolId?: string;
  calleeName: string;
  filePath: string;
  range: CodeRange;
}

export interface ParseResult {
  filePath: string;
  language: SupportedLanguage;
  symbols: CodeSymbol[];
  imports: ImportDeclaration[];
  exports: ExportDeclaration[];
  calls: CallReference[];
  diagnostics: CodeDiagnostic[];
  isPartial: boolean;
  error?: string;
}

export interface CodeDiagnostic {
  filePath: string;
  range: CodeRange;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
  code?: string | number;
}

export interface IndexQueryOptions {
  limit?: number;
  kind?: SymbolKind;
  language?: SupportedLanguage;
  caseSensitive?: boolean;
  includeDependencies?: boolean;
}

export interface CodeIndex {
  indexWorkspace(workspacePath: string): Promise<void>;
  indexFile(filePath: string, content?: string): Promise<ParseResult>;
  removeFile(filePath: string): Promise<void>;
  searchText(query: string, options?: IndexQueryOptions): Promise<CodeLocation[]>;
  searchSymbols(query: string, options?: IndexQueryOptions): Promise<CodeSymbol[]>;
  findDefinition(symbolName: string, contextPath?: string): Promise<CodeLocation[]>;
  findReferences(symbolName: string): Promise<CodeLocation[]>;
  relatedFiles(filePath: string): Promise<string[]>;
  getDiagnostics(filePath?: string): Promise<CodeDiagnostic[]>;
  clear(): Promise<void>;
}
