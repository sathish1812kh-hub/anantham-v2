/**
 * Multi-Language AST & Grammar Parser
 * PRD-CODE-003: Multi-Language AST & Parser Adapters
 * PRD-INV-001: Strict Code Intelligence Invariants & Fault Isolation
 */

import { extname } from "node:path";
import type {
  SupportedLanguage,
  ParseResult,
  CodeSymbol,
  ImportDeclaration,
  ExportDeclaration,
  CallReference,
  CodeDiagnostic,
} from "../types.js";

export class MultiLanguageAstParser {
  public detectLanguage(filePath: string): SupportedLanguage {
    const ext = extname(filePath).toLowerCase();
    switch (ext) {
      case ".ts":
      case ".tsx":
      case ".mts":
      case ".cts":
        return "typescript";
      case ".js":
      case ".jsx":
      case ".mjs":
      case ".cjs":
        return "javascript";
      case ".py":
        return "python";
      case ".go":
        return "go";
      case ".rs":
        return "rust";
      case ".java":
        return "java";
      case ".c":
      case ".h":
        return "c";
      case ".cpp":
      case ".hpp":
      case ".cc":
      case ".cxx":
        return "cpp";
      case ".json":
        return "json";
      case ".yaml":
      case ".yml":
        return "yaml";
      case ".md":
      case ".markdown":
        return "markdown";
      default:
        return "unknown";
    }
  }

  public parse(filePath: string, content: string): ParseResult {
    const language = this.detectLanguage(filePath);
    const symbols: CodeSymbol[] = [];
    const imports: ImportDeclaration[] = [];
    const exports: ExportDeclaration[] = [];
    const calls: CallReference[] = [];
    const diagnostics: CodeDiagnostic[] = [];

    // Guard against binary or non-text files
    if (this.isBinary(content)) {
      diagnostics.push({
        filePath,
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
        message: "File contains binary content or null bytes; skipping AST extraction",
        severity: "warning",
      });
      return {
        filePath,
        language,
        symbols: [],
        imports: [],
        exports: [],
        calls: [],
        diagnostics,
        isPartial: true,
      };
    }

    try {
      const lines = content.split(/\r?\n/);

      switch (language) {
        case "typescript":
        case "javascript":
          this.parseTypeScriptJavaScript(filePath, lines, language, symbols, imports, exports, calls);
          break;
        case "python":
          this.parsePython(filePath, lines, symbols, imports, calls);
          break;
        case "go":
          this.parseGo(filePath, lines, symbols, imports, exports);
          break;
        case "rust":
          this.parseRust(filePath, lines, symbols, imports);
          break;
        case "java":
          this.parseJava(filePath, lines, symbols, imports);
          break;
        case "c":
        case "cpp":
          this.parseCAndCpp(filePath, lines, language, symbols, imports);
          break;
        case "json":
          this.parseJson(filePath, content, symbols, diagnostics);
          break;
        case "yaml":
          this.parseYaml(filePath, lines, symbols);
          break;
        case "markdown":
          this.parseMarkdown(filePath, lines, symbols);
          break;
        default:
          this.parseGeneric(filePath, lines, symbols);
          break;
      }

      return {
        filePath,
        language,
        symbols,
        imports,
        exports,
        calls,
        diagnostics,
        isPartial: false,
      };
    } catch (err) {
      diagnostics.push({
        filePath,
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
        message: err instanceof Error ? err.message : String(err),
        severity: "error",
      });
      return {
        filePath,
        language,
        symbols,
        imports,
        exports,
        calls,
        diagnostics,
        isPartial: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private isBinary(content: string): boolean {
    const checkLength = Math.min(content.length, 4096);
    for (let i = 0; i < checkLength; i++) {
      if (content.charCodeAt(i) === 0) {
        return true;
      }
    }
    return false;
  }

  private parseTypeScriptJavaScript(
    filePath: string,
    lines: string[],
    language: SupportedLanguage,
    symbols: CodeSymbol[],
    imports: ImportDeclaration[],
    exports: ExportDeclaration[],
    calls: CallReference[]
  ): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Imports
      const importMatch = line.match(/^import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch && importMatch[4]) {
        const source = importMatch[4];
        const specifiers: ImportDeclaration["specifiers"] = [];
        if (importMatch[1]) {
          importMatch[1].split(",").forEach((s) => {
            const parts = s.trim().split(/\s+as\s+/);
            const name = parts[0];
            if (name) specifiers.push({ name, alias: parts[1] });
          });
        } else if (importMatch[2]) {
          specifiers.push({ name: importMatch[2], isNamespace: true });
        } else if (importMatch[3]) {
          specifiers.push({ name: importMatch[3], isDefault: true });
        }
        imports.push({
          source,
          specifiers,
          range: {
            start: { line: lineNum, character: line.indexOf("import") + 1 },
            end: { line: lineNum, character: line.length + 1 },
          },
        });
      }

      // Exports
      const exportMatch = line.match(/export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/);
      if (exportMatch && exportMatch[1]) {
        exports.push({
          name: exportMatch[1],
          isDefault: line.includes("export default"),
          range: {
            start: { line: lineNum, character: line.indexOf("export") + 1 },
            end: { line: lineNum, character: line.length + 1 },
          },
        });
      }

      // Classes
      const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
      if (classMatch && classMatch[1]) {
        symbols.push({
          id: `${filePath}#${classMatch[1]}:${lineNum}`,
          name: classMatch[1],
          kind: "class",
          language,
          filePath,
          range: {
            start: { line: lineNum, character: line.indexOf(classMatch[1]) + 1 },
            end: { line: lineNum, character: line.length + 1 },
          },
        });
      }

      // Interfaces
      const ifaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
      if (ifaceMatch && ifaceMatch[1]) {
        symbols.push({
          id: `${filePath}#${ifaceMatch[1]}:${lineNum}`,
          name: ifaceMatch[1],
          kind: "interface",
          language,
          filePath,
          range: {
            start: { line: lineNum, character: line.indexOf(ifaceMatch[1]) + 1 },
            end: { line: lineNum, character: line.length + 1 },
          },
        });
      }

      // Functions
      const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (fnMatch && fnMatch[1]) {
        symbols.push({
          id: `${filePath}#${fnMatch[1]}:${lineNum}`,
          name: fnMatch[1],
          kind: "function",
          language,
          filePath,
          range: {
            start: { line: lineNum, character: line.indexOf(fnMatch[1]) + 1 },
            end: { line: lineNum, character: line.length + 1 },
          },
        });
      }

      // Methods
      const methodMatch = line.match(/^\s*(?:public|private|protected)?\s*(?:static)?\s*(?:async)?\s*(\w+)\s*\([^)]*\)\s*[:{]/);
      if (methodMatch && methodMatch[1] && !line.includes("function") && !line.includes("class") && !line.includes("if") && !line.includes("switch")) {
        symbols.push({
          id: `${filePath}#method_${methodMatch[1]}:${lineNum}`,
          name: methodMatch[1],
          kind: "method",
          language,
          filePath,
          range: {
            start: { line: lineNum, character: line.indexOf(methodMatch[1]) + 1 },
            end: { line: lineNum, character: line.length + 1 },
          },
        });
      }

      // Calls
      const callMatches = line.matchAll(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g);
      for (const cm of callMatches) {
        const callee = cm[1];
        if (callee && !["if", "for", "while", "switch", "catch", "function"].includes(callee)) {
          calls.push({
            calleeName: callee,
            filePath,
            range: {
              start: { line: lineNum, character: (cm.index ?? 0) + 1 },
              end: { line: lineNum, character: (cm.index ?? 0) + callee.length + 1 },
            },
          });
        }
      }
    });
  }

  private parsePython(
    filePath: string,
    lines: string[],
    symbols: CodeSymbol[],
    imports: ImportDeclaration[],
    calls: CallReference[]
  ): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Imports
      const importMatch = line.match(/^import\s+([\w\s,]+)|^from\s+(\w+)\s+import\s+([\w\s,*]+)/);
      if (importMatch) {
        const source = importMatch[2] || importMatch[1];
        if (source) {
          imports.push({
            source: source.trim(),
            specifiers: [],
            range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
          });
        }
      }

      // Classes
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch && classMatch[1]) {
        symbols.push({
          id: `${filePath}#${classMatch[1]}:${lineNum}`,
          name: classMatch[1],
          kind: "class",
          language: "python",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }

      // Functions / Methods
      const defMatch = line.match(/^\s*def\s+(\w+)/);
      if (defMatch && defMatch[1]) {
        const isMethod = line.startsWith("    ") || line.startsWith("\t");
        symbols.push({
          id: `${filePath}#${defMatch[1]}:${lineNum}`,
          name: defMatch[1],
          kind: isMethod ? "method" : "function",
          language: "python",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }

      // Calls
      const callMatches = line.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g);
      for (const cm of callMatches) {
        const callee = cm[1];
        if (callee && !["def", "class", "if", "for", "while", "elif"].includes(callee)) {
          calls.push({
            calleeName: callee,
            filePath,
            range: { start: { line: lineNum, character: (cm.index ?? 0) + 1 }, end: { line: lineNum, character: line.length + 1 } },
          });
        }
      }
    });
  }

  private parseGo(
    filePath: string,
    lines: string[],
    symbols: CodeSymbol[],
    imports: ImportDeclaration[],
    exports: ExportDeclaration[]
  ): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Imports
      const importMatch = line.match(/^import\s+"([^"]+)"/);
      if (importMatch && importMatch[1]) {
        imports.push({
          source: importMatch[1],
          specifiers: [],
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }

      // Functions & Methods
      const fnMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)/);
      if (fnMatch && fnMatch[1]) {
        const name = fnMatch[1];
        const isExported = name[0] !== undefined && name[0] === name[0].toUpperCase();
        if (isExported) {
          exports.push({
            name,
            range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
          });
        }
        symbols.push({
          id: `${filePath}#${name}:${lineNum}`,
          name,
          kind: line.includes("(") && line.indexOf(")") < line.indexOf(name) ? "method" : "function",
          language: "go",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }

      // Types / Structs / Interfaces
      const typeMatch = line.match(/^type\s+(\w+)\s+(struct|interface)/);
      if (typeMatch && typeMatch[1]) {
        symbols.push({
          id: `${filePath}#${typeMatch[1]}:${lineNum}`,
          name: typeMatch[1],
          kind: typeMatch[2] === "interface" ? "interface" : "class",
          language: "go",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }
    });
  }

  private parseRust(
    filePath: string,
    lines: string[],
    symbols: CodeSymbol[],
    imports: ImportDeclaration[]
  ): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // use statement
      const useMatch = line.match(/^use\s+([^;]+);/);
      if (useMatch && useMatch[1]) {
        imports.push({
          source: useMatch[1].trim(),
          specifiers: [],
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }

      // struct/enum/trait
      const structMatch = line.match(/(?:pub\s+)?(struct|enum|trait)\s+(\w+)/);
      if (structMatch && structMatch[2]) {
        symbols.push({
          id: `${filePath}#${structMatch[2]}:${lineNum}`,
          name: structMatch[2],
          kind: structMatch[1] === "trait" ? "interface" : structMatch[1] === "enum" ? "enum" : "class",
          language: "rust",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }

      // fn
      const fnMatch = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
      if (fnMatch && fnMatch[1]) {
        symbols.push({
          id: `${filePath}#${fnMatch[1]}:${lineNum}`,
          name: fnMatch[1],
          kind: "function",
          language: "rust",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }
    });
  }

  private parseJava(
    filePath: string,
    lines: string[],
    symbols: CodeSymbol[],
    imports: ImportDeclaration[]
  ): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Imports
      const importMatch = line.match(/^import\s+([^;]+);/);
      if (importMatch && importMatch[1]) {
        imports.push({
          source: importMatch[1].trim(),
          specifiers: [],
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }

      // Class / Interface / Enum
      const classMatch = line.match(/(?:public|protected|private)?\s*(?:static)?\s*(class|interface|enum)\s+(\w+)/);
      if (classMatch && classMatch[2]) {
        symbols.push({
          id: `${filePath}#${classMatch[2]}:${lineNum}`,
          name: classMatch[2],
          kind: classMatch[1] === "interface" ? "interface" : classMatch[1] === "enum" ? "enum" : "class",
          language: "java",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }
    });
  }

  private parseCAndCpp(
    filePath: string,
    lines: string[],
    language: SupportedLanguage,
    symbols: CodeSymbol[],
    imports: ImportDeclaration[]
  ): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // #include
      const incMatch = line.match(/^#include\s+[<"]([^>"]+)[>"]/);
      if (incMatch && incMatch[1]) {
        imports.push({
          source: incMatch[1],
          specifiers: [],
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }

      // struct / class
      const typeMatch = line.match(/(?:struct|class)\s+(\w+)\s*[{;]/);
      if (typeMatch && typeMatch[1]) {
        symbols.push({
          id: `${filePath}#${typeMatch[1]}:${lineNum}`,
          name: typeMatch[1],
          kind: "class",
          language,
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }
    });
  }

  private parseJson(filePath: string, content: string, symbols: CodeSymbol[], diagnostics: CodeDiagnostic[]): void {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === "object" && parsed !== null) {
        Object.keys(parsed).forEach((key, idx) => {
          symbols.push({
            id: `${filePath}#${key}:${idx + 1}`,
            name: key,
            kind: "key",
            language: "json",
            filePath,
            range: { start: { line: idx + 1, character: 1 }, end: { line: idx + 1, character: key.length + 1 } },
          });
        });
      }
    } catch (e) {
      diagnostics.push({
        filePath,
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
        message: e instanceof Error ? e.message : "Malformed JSON",
        severity: "error",
      });
    }
  }

  private parseYaml(filePath: string, lines: string[], symbols: CodeSymbol[]): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const keyMatch = line.match(/^([a-zA-Z0-9_-]+):/);
      if (keyMatch && keyMatch[1]) {
        symbols.push({
          id: `${filePath}#${keyMatch[1]}:${lineNum}`,
          name: keyMatch[1],
          kind: "key",
          language: "yaml",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }
    });
  }

  private parseMarkdown(filePath: string, lines: string[], symbols: CodeSymbol[]): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        symbols.push({
          id: `${filePath}#heading_${idx}:${lineNum}`,
          name: headingMatch[2].trim(),
          kind: "module",
          language: "markdown",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
          detail: `Level ${headingMatch[1].length}`,
        });
      }
    });
  }

  private parseGeneric(filePath: string, lines: string[], symbols: CodeSymbol[]): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const idMatch = line.match(/^[a-zA-Z_]\w*\s*=/);
      if (idMatch) {
        symbols.push({
          id: `${filePath}#gen_${idx}:${lineNum}`,
          name: idMatch[0].replace("=", "").trim(),
          kind: "variable",
          language: "unknown",
          filePath,
          range: { start: { line: lineNum, character: 1 }, end: { line: lineNum, character: line.length + 1 } },
        });
      }
    });
  }
}
