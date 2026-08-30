import { describe, it, expect } from "vitest";
import { StructuredDataParser } from "../../src/content/parsers/structured-parser.js";

describe("P2.1 Content Subsystem — Structured Data Parser (JSON & CSV)", () => {
  it("parses JSON object and extracts key counts and representations", () => {
    const jsonStr = JSON.stringify({ name: "Anantham", version: 2, enabled: true }, null, 2);
    const buffer = Buffer.from(jsonStr, "utf8");

    const result = StructuredDataParser.parse(buffer, "json");

    expect(result.metadata.format).toBe("json");
    expect(result.metadata.keysCount).toBe(3);
    expect(result.representations.some((r) => r.type === "json")).toBe(true);
    expect(result.representations.some((r) => r.type === "text")).toBe(true);
  });

  it("parses CSV data into columns and table representations", () => {
    const csvStr = "id,name,role\n1,Alice,Architect\n2,Bob,Engineer\n3,Charlie,Operator\n";
    const buffer = Buffer.from(csvStr, "utf8");

    const result = StructuredDataParser.parse(buffer, "csv");

    expect(result.metadata.format).toBe("csv");
    expect(result.metadata.rowCount).toBe(4);
    expect(result.metadata.columns).toEqual(["id", "name", "role"]);

    const tableRep = result.representations.find((r) => r.type === "table");
    expect(tableRep).toBeDefined();
    const rows = JSON.parse(tableRep!.data!);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ id: "1", name: "Alice", role: "Architect" });
  });

  it("throws clear error when JSON is malformed", () => {
    const badJson = Buffer.from("{ name: invalid_json", "utf8");
    expect(() => StructuredDataParser.parse(badJson, "json")).toThrow(/Failed to parse JSON content/);
  });
});
