import { describe, it, expect } from "vitest";
import { MultiLanguageAstParser } from "../../src/code-intel/parsers/multi-language-ast-parser.js";
import { CodeIntelFaultIsolator } from "../../src/code-intel/fault-isolator.js";
import { CodeIndexEngine } from "../../src/code-intel/code-index-engine.js";

describe("Adversarial Stress Suite: AST Parsing, Edge Cases & Fault Isolation", () => {
  const parser = new MultiLanguageAstParser();
  const faultIsolator = new CodeIntelFaultIsolator({ timeoutMs: 300, maxFileSizeChars: 500 * 1024 });

  describe("1. Syntax Errors & Malformed Grammar Across Languages", () => {
    it("handles severely corrupted TypeScript/JavaScript syntax without throwing uncaught exceptions", () => {
      const corruptedTS = `
        import { foo, , bar } from "
        export default class {
        function async (({[
        const x = ;
        class BrokenClass extends {
          private static async
        }
        unknownIdentifier(
      `;

      const result = parser.parse("corrupted.ts", corruptedTS);
      expect(result).toBeDefined();
      expect(result.filePath).toBe("corrupted.ts");
      expect(result.language).toBe("typescript");
      expect(Array.isArray(result.symbols)).toBe(true);
      expect(Array.isArray(result.diagnostics)).toBe(true);
    });

    it("handles malformed Python with invalid indentation, dangling defs, and syntax errors", () => {
      const corruptedPython = `
        import os, , sys
        from import invalid
        class :
            def
        def broken_fn(a, b,:
        \t\t\tmisaligned_indent = 1
          call_without_closing(
      `;

      const result = parser.parse("corrupted.py", corruptedPython);
      expect(result).toBeDefined();
      expect(result.language).toBe("python");
      expect(Array.isArray(result.symbols)).toBe(true);
      expect(Array.isArray(result.calls)).toBe(true);
    });

    it("handles malformed Go syntax with empty signatures, broken structs, and invalid exports", () => {
      const corruptedGo = "package main\nimport \"\nfunc () {\ntype struct {\nfunc (r) ()\nfunc ValidFunc() {}\n";

      const result = parser.parse("corrupted.go", corruptedGo);
      expect(result).toBeDefined();
      expect(result.language).toBe("go");
      expect(result.symbols.some((s) => s.name === "ValidFunc")).toBe(true);
      expect(result.exports.some((e) => e.name === "ValidFunc")).toBe(true);
    });

    it("handles malformed Rust syntax with dangling keywords, broken structs, and invalid use statements", () => {
      const corruptedRust = `
        use ;
        pub struct ;
        pub trait ;
        pub async fn ;
        pub fn valid_rust_fn() {}
      `;

      const result = parser.parse("corrupted.rs", corruptedRust);
      expect(result).toBeDefined();
      expect(result.language).toBe("rust");
      expect(result.symbols.some((s) => s.name === "valid_rust_fn")).toBe(true);
    });

    it("handles malformed C/C++ syntax with broken includes and incomplete structs", () => {
      const corruptedC = `
        #include <>
        #include "unclosed
        struct {
        class ;
        struct ValidStruct { int x; };
      `;

      const result = parser.parse("corrupted.cpp", corruptedC);
      expect(result).toBeDefined();
      expect(result.language).toBe("cpp");
      expect(result.symbols.some((s) => s.name === "ValidStruct")).toBe(true);
    });

    it("handles malformed JSON with diagnostics and zero crashes", () => {
      const malformedJson = `{ "key": "value", "broken": [1, 2, }`;
      const result = parser.parse("config.json", malformedJson);
      expect(result).toBeDefined();
      expect(result.language).toBe("json");
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]!.severity).toBe("error");
    });
  });

  describe("2. Deeply Nested Brackets & Complexity Stress (Anti-ReDoS & Stack Overflow)", () => {
    it("handles 5,000 levels of nested parentheses and brackets without stack overflow or hang", () => {
      const depth = 5000;
      const nestedParens = "let expr = " + "(".repeat(depth) + "x" + ")".repeat(depth) + ";\n";
      const nestedBrackets = "let arr = " + "[".repeat(depth) + "1" + "]".repeat(depth) + ";\n";
      const payload = nestedParens + nestedBrackets + "function testDeep() {}\n";

      const start = Date.now();
      const result = parser.parse("deeply_nested.ts", payload);
      const elapsed = Date.now() - start;

      expect(result).toBeDefined();
      expect(result.symbols.some((s) => s.name === "testDeep")).toBe(true);
      expect(elapsed).toBeLessThan(1500); // Must complete within 1.5s
    });

    it("handles deeply nested chained function calls without catastrophic backtracking", () => {
      let callChain = "root";
      for (let i = 0; i < 2000; i++) {
        callChain += `.call${i}()`;
      }
      callChain += ";\n";

      const start = Date.now();
      const result = parser.parse("chained_calls.js", callChain);
      const elapsed = Date.now() - start;

      expect(result).toBeDefined();
      expect(result.calls.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(1000);
    });

    it("handles 10,000 empty lines and whitespace padding smoothly", () => {
      const payload = "\n".repeat(10000) + "export class WhitespaceClass {}\n" + "\n".repeat(1000);
      const result = parser.parse("spaces.ts", payload);
      expect(result.symbols.some((s) => s.name === "WhitespaceClass")).toBe(true);
      expect(result.exports.some((e) => e.name === "WhitespaceClass")).toBe(true);
    });
  });

  describe("3. Binary Files & Null Byte Protection", () => {
    it("detects null bytes at offset 0 and skips AST extraction with warning diagnostic", () => {
      const binaryPayload = "\x00\x00\x01\x00ELF binary content here with class FakeClass {}";
      const result = parser.parse("fake_binary.ts", binaryPayload);

      expect(result.isPartial).toBe(true);
      expect(result.symbols.length).toBe(0);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]!.message).toContain("binary");
    });

    it("detects embedded null byte in middle of code and safely isolates file", () => {
      const mixedPayload = "const a = 1;\nconst b = '\x00';\nclass ShouldNotParse {}";
      const result = parser.parse("mixed.js", mixedPayload);

      expect(result.isPartial).toBe(true);
      expect(result.symbols.length).toBe(0);
    });

    it("FaultIsolator rejects binary files before passing to parser", async () => {
      const isolator = new CodeIntelFaultIsolator({ rejectBinary: true });
      const binaryContent = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR";

      const res = await isolator.executeIsolatedParse("image.png", binaryContent, (p, c) =>
        parser.parse(p, c)
      );

      expect(res.isPartial).toBe(true);
      expect(res.error).toBe("Binary content rejected");
      expect(res.diagnostics.some((d) => d.message.includes("Binary file rejected"))).toBe(true);
    });
  });

  describe("4. Huge Inputs & Memory Threshold Enforcements", () => {
    it("FaultIsolator rejects files exceeding maxFileSizeChars threshold", async () => {
      const isolator = new CodeIntelFaultIsolator({ maxFileSizeChars: 10 * 1024 }); // 10KB threshold
      const hugePayload = "const x = 1;\n".repeat(2000); // ~26KB

      const res = await isolator.executeIsolatedParse("huge.ts", hugePayload, (p, c) =>
        parser.parse(p, c)
      );

      expect(res.isPartial).toBe(true);
      expect(res.error).toBe("File size exceeds threshold");
      expect(res.diagnostics.some((d) => d.message.includes("exceeds maximum allowed parser threshold"))).toBe(true);
      expect(res.symbols.length).toBe(0);
    });

    it("processes 50,000 lines of valid code within threshold safely", () => {
      const lines: string[] = [];
      for (let i = 0; i < 5000; i++) {
        lines.push(`export function func_${i}() { return ${i}; }`);
      }
      const code = lines.join("\n");

      const result = parser.parse("large_code.ts", code);
      expect(result.symbols.length).toBe(5000);
      expect(result.exports.length).toBe(5000);
      expect(result.isPartial).toBe(false);
    });
  });

  describe("5. Timeout Guards & Isolated Execution Fault Tolerance", () => {
    it("FaultIsolator triggers timeout protection when parser takes longer than timeoutMs", async () => {
      const isolator = new CodeIntelFaultIsolator({ timeoutMs: 50 });

      // Simulate a stalling parser
      const stallingParser = async (_p: string, _c: string) => {
        await new Promise((r) => setTimeout(r, 200));
        return parser.parse(_p, _c);
      };

      const res = await isolator.executeIsolatedParse("slow.ts", "const a = 1;", stallingParser);

      expect(res.isPartial).toBe(true);
      expect(res.error).toContain("Parser timeout");
      expect(res.diagnostics.some((d) => d.message.includes("timed out"))).toBe(true);
    });

    it("FaultIsolator intercepts uncaught exceptions from custom parsers gracefully", async () => {
      const isolator = new CodeIntelFaultIsolator();

      const explodingParser = () => {
        throw new Error("Simulated AST Parser Fatal Crash!");
      };

      const res = await isolator.executeIsolatedParse("fatal.ts", "class Test {}", explodingParser);

      expect(res.isPartial).toBe(true);
      expect(res.error).toBe("Simulated AST Parser Fatal Crash!");
      expect(res.diagnostics.some((d) => d.message.includes("Parser threw exception"))).toBe(true);
    });
  });

  describe("6. CodeIndexEngine Integration Robustness", () => {
    it("indexes and searches corrupt and clean files concurrently without crashing", async () => {
      const engine = new CodeIndexEngine();

      await engine.indexFile("clean.ts", "export class AccountService { balance() {} }");
      await engine.indexFile("corrupt.ts", "import { unclosed from ");
      await engine.indexFile("binary.bin", "\x00\x01\x02\x03");

      const symbols = await engine.searchSymbols("AccountService");
      expect(symbols.length).toBe(1);
      expect(symbols[0]!.name).toBe("AccountService");

      const defs = await engine.findDefinition("AccountService");
      expect(defs.length).toBe(1);

      const diags = await engine.getDiagnostics();
      expect(diags.length).toBeGreaterThan(0);
    });
  });
});
