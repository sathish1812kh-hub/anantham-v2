import { describe, it, expect } from "vitest";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";

describe("P2.1 Content Subsystem — Content Ingestion Engine E2E", () => {
  it("ingests source code with automatic language detection and provenance binding", async () => {
    const code = "console.log('Anantham V2 Ingestion');";
    const content = await ContentIngestionEngine.ingest({
      data: code,
      name: "server.js",
      source: { type: "upload", uri: "file:///server.js" },
      actor: "developer",
      sensitivity: "normal",
    });

    expect(content.kind).toBe("code");
    expect(content.mimeType).toBe("text/javascript");
    expect(content.name).toBe("server.js");
    expect(content.provenance.sourceId).toBe("developer");
    expect(content.security.sensitivity).toBe("normal");
    expect(content.representations.length).toBeGreaterThanOrEqual(1);
    expect(content.sha256).toHaveLength(64);
  });

  it("ingests CSV data into table and csv representations", async () => {
    const csvData = "model,tokens,cost\nclaude-3-5,200k,0.015\ngpt-4o,128k,0.01\n";
    const content = await ContentIngestionEngine.ingest({
      data: csvData,
      name: "benchmarks.csv",
      source: { type: "tool", uri: "tool://benchmark-runner" },
      actor: "agent",
    });

    expect(content.kind).toBe("table");
    expect(content.representations.some((r) => r.type === "table")).toBe(true);
    expect(content.representations.some((r) => r.type === "csv")).toBe(true);
  });

  it("enforces maximum file size limit", async () => {
    const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
    await expect(
      ContentIngestionEngine.ingest({
        data: largeBuffer,
        name: "oversized.bin",
        source: { type: "upload" },
        maxSizeBytes: 500 * 1024, // 500KB limit
      })
    ).rejects.toThrow(/exceeds maximum allowed limit/);
  });

  it("safely ingests and preserves unknown binary data", async () => {
    const binData = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x01, 0x02]);
    const content = await ContentIngestionEngine.ingest({
      data: binData,
      name: "firmware.bin",
      source: { type: "filesystem", uri: "/tmp/firmware.bin" },
    });

    expect(content.kind).toBe("binary");
    expect(content.mimeType).toBe("application/octet-stream");
    expect(content.representations.some((r) => r.type === "raw")).toBe(true);
    expect(content.representations.some((r) => r.type === "metadata")).toBe(true);
  });
});
