import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createSearchTools } from "../../../src/tools/native/search-tools.js";

describe("P4.3 Native Search Tools — Text & File Search", () => {
  let tempDir: string;
  let tools: ReturnType<typeof createSearchTools>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham_search_test_"));
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "src/main.ts"), "const secret_agent = '007';\nconsole.log('App starting');");
    fs.writeFileSync(path.join(tempDir, "src/config.json"), '{\n  "mode": "production"\n}');

    tools = createSearchTools({ projectRoot: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("searches text across project files matching exact keywords and regex", async () => {
    const [searchText] = tools;

    const res1 = (await searchText.handler(
      { query: "secret_agent" },
      { callId: "s1", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;

    expect(res1.matchCount).toBe(1);
    expect(res1.matches[0].file).toContain("main.ts");
    expect(res1.matches[0].line).toBe(1);

    const res2 = (await searchText.handler(
      { query: "App\\s+\\w+", isRegex: true },
      { callId: "s2", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;

    expect(res2.matchCount).toBe(1);
    expect(res2.matches[0].lineContent).toContain("App starting");
  });

  it("finds files matching pattern within project boundary", async () => {
    const [, findFiles] = tools;

    const res = (await findFiles.handler(
      { pattern: "config" },
      { callId: "s3", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;

    expect(res.matchCount).toBe(1);
    expect(res.files[0]).toContain("config.json");
  });
});
