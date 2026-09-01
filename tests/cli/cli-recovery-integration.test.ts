import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CliApplication } from "../../src/cli/cli-application.js";

describe("P8.1 CLI — Crash Recovery & Startup Integration", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-cli-rec-"));
    dbPath = path.join(tmpDir, "cli_rec.db");
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("performs startup recovery check cleanly and executes /resume command", async () => {
    // Process 1: Setup project & session, then shutdown
    {
      const app1 = new CliApplication({ dbPath });
      await app1.initialize();

      await app1.executeSingleCommand('/project create "Recovery Project"');
      await app1.executeSingleCommand('/session create "Recovery Session"');
      await app1.executeSingleCommand('/task create "Recoverable Task"');

      app1.shutdown();
    }

    // Process 2: Reopen with new CliApplication and verify /resume and /task list
    {
      const app2 = new CliApplication({ dbPath });
      await app2.initialize();

      const projectsRes = await app2.executeSingleCommand("/project list");
      expect(projectsRes.success).toBe(true);
      const projId = (projectsRes.data as any[])[0].id;

      await app2.executeSingleCommand(`/project select ${projId}`);

      const sessionsRes = await app2.executeSingleCommand("/session list");
      expect(sessionsRes.success).toBe(true);
      const sessId = (sessionsRes.data as any[])[0].id;

      await app2.executeSingleCommand(`/session select ${sessId}`);

      const resumeRes = await app2.executeSingleCommand("/resume");
      expect(resumeRes.success).toBe(true);

      const tasksRes = await app2.executeSingleCommand("/task list");
      expect(tasksRes.success).toBe(true);
      expect((tasksRes.data as any[]).length).toBe(1);

      app2.shutdown();
    }
  });
});
