import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createFilesystemTools } from "../../../src/tools/native/filesystem-tools.js";

describe("P4.3 Native Filesystem Tools — CRUD, Path Containment & Metadata", () => {
  let tempDir: string;
  let tools: ReturnType<typeof createFilesystemTools>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham_fs_test_"));
    tools = createFilesystemTools({ projectRoot: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes, reads, inspects stats, lists, and deletes files safely", async () => {
    const [readFile, writeFile, listDir, fileStat, deleteFile] = tools;

    // 1. Write file
    const writeRes = (await writeFile.handler(
      { path: "docs/readme.txt", content: "Hello Anantham V2" },
      { callId: "c1", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;
    expect(writeRes.path).toBe("docs/readme.txt");

    // 2. Read file
    const readRes = (await readFile.handler(
      { path: "docs/readme.txt" },
      { callId: "c2", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;
    expect(readRes.content).toBe("Hello Anantham V2");

    // 3. File stat
    const statRes = (await fileStat.handler(
      { path: "docs/readme.txt" },
      { callId: "c3", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;
    expect(statRes.isFile).toBe(true);
    expect(statRes.size).toBeGreaterThan(0);

    // 4. List dir
    const listRes = (await listDir.handler(
      { path: "docs" },
      { callId: "c4", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;
    expect(listRes.entries.length).toBe(1);
    expect(listRes.entries[0].name).toBe("readme.txt");

    // 5. Delete file
    const delRes = (await deleteFile.handler(
      { path: "docs/readme.txt" },
      { callId: "c5", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;
    expect(delRes.deleted).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "docs/readme.txt"))).toBe(false);
  });

  it("PATH TRAVERSAL DEFENSE: Rejects traversal attempts outside project boundary", async () => {
    const [readFile] = tools;
    await expect(
      readFile.handler(
        { path: "../../etc/passwd" },
        { callId: "c_bad", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
      )
    ).rejects.toThrow("attempts to escape project boundary");
  });
});
