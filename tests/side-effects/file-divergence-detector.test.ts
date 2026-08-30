import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FileDivergenceDetector } from "../../src/side-effects/file-divergence-detector.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { createFilesystemTools } from "../../src/tools/native/filesystem-tools.js";

describe("P4.5 File Divergence Detector — User Change Protection", () => {
  let tmpDir: string;
  let detector: FileDivergenceDetector;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham_div_test_"));
    detector = new FileDivergenceDetector();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects when file on disk matches base hash (synced)", () => {
    const filePath = path.join(tmpDir, "file.txt");
    fs.writeFileSync(filePath, "initial content", "utf8");
    const baseHash = detector.computeFileHash(filePath);

    const record = detector.detectDivergence(filePath, baseHash);
    expect(record.status).toBe("synced");
    expect(() => detector.assertNoDivergence(filePath, baseHash)).not.toThrow();
  });

  it("detects when file was externally modified on disk (diverged) and halts write", () => {
    const filePath = path.join(tmpDir, "file.txt");
    fs.writeFileSync(filePath, "initial content", "utf8");
    const baseHash = detector.computeFileHash(filePath);

    // External modification by user / other process
    fs.writeFileSync(filePath, "user modified content!", "utf8");

    const record = detector.detectDivergence(filePath, baseHash);
    expect(record.status).toBe("diverged");
    expect(() => detector.assertNoDivergence(filePath, baseHash)).toThrow(
      /FILE_DIVERGENCE_DETECTED/
    );
  });

  it("ToolGateway halts execution with FILE_DIVERGENCE_ERROR when baseHash is stale", async () => {
    const registry = new ToolRegistry();
    const fsTools = createFilesystemTools({ defaultProjectRoot: tmpDir });
    for (const tool of fsTools) {
      registry.register(tool);
    }

    const gateway = new ToolGateway({
      registry,
      fileDivergenceDetector: detector,
    });

    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "Version 1", "utf8");

    // Stale baseHash
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";

    const res = await gateway.invoke({
      callId: "call_div_gate",
      toolName: "write_file",
      arguments: {
        path: filePath,
        content: "Version 2 Overwrite Attempt",
        baseHash: staleHash,
      },
      actor: { id: "agent_01", type: "agent" },
      project: { id: "prj_01" },
    });

    expect(res.status).toBe("failure");
    expect(res.error?.code).toBe("FILE_DIVERGENCE_ERROR");
    expect(res.error?.message).toContain("FILE_DIVERGENCE_DETECTED");
  });
});
