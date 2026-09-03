import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { BrowserZombieReclaimer, type BrowserInstanceRecord } from "../../src/recovery/browser-zombie-reclaimer.js";

describe("PRD-PART2-306: Browser Session Timeout & Zombie Reclamation", () => {
  const testDir = join(process.cwd(), ".test_browser_reclaimer_" + Date.now());
  let reclaimer: BrowserZombieReclaimer;
  const killedPids: number[] = [];
  const cleanedDirs: string[] = [];

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    killedPids.length = 0;
    cleanedDirs.length = 0;

    reclaimer = new BrowserZombieReclaimer({
      processKiller: async (pid) => {
        killedPids.push(pid);
        return true;
      },
      fsCleaner: async (dirPath) => {
        cleanedDirs.push(dirPath);
        if (existsSync(dirPath)) {
          rmSync(dirPath, { recursive: true, force: true });
        }
      },
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("enforces action timeout and aborts signal when execution takes too long", async () => {
    const profileDir = join(testDir, "profile_01");
    mkdirSync(profileDir, { recursive: true });

    const browser: BrowserInstanceRecord = {
      browserId: "brw_001",
      sessionId: "sess_001",
      agentId: "agent_01",
      taskId: "task_01",
      pid: 12345,
      childPids: [12346, 12347],
      userDataDir: profileDir,
      timeouts: {
        navigationTimeoutMs: 100,
        actionTimeoutMs: 50,
        sessionTimeoutMs: 1000,
        idleTimeoutMs: 200,
      },
      state: "ACTIVE",
      launchedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      lastActionAt: Date.now(),
    };

    reclaimer.registerBrowser(browser);

    // Should time out after 50ms
    await expect(
      reclaimer.executeWithTimeout("brw_001", "action", async (signal) => {
        return new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve("aborted"));
          setTimeout(() => resolve("success"), 200);
        });
      })
    ).rejects.toThrow(/timed out/i);

    const instance = reclaimer.getBrowser("brw_001");
    expect(instance?.state).toBe("TIMED_OUT");
  });

  it("reclaims zombies when session timeout or idle timeout expires and kills process tree", async () => {
    const profileDir = join(testDir, "profile_zombie");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, "cookie.txt"), "dummy_data");

    const browser: BrowserInstanceRecord = {
      browserId: "brw_zombie",
      sessionId: "sess_zombie",
      agentId: "agent_02",
      taskId: "task_02",
      pid: 99991,
      childPids: [99992, 99993],
      userDataDir: profileDir,
      timeouts: {
        navigationTimeoutMs: 100,
        actionTimeoutMs: 100,
        sessionTimeoutMs: 500,
        idleTimeoutMs: 100,
      },
      state: "ACTIVE",
      launchedAt: Date.now() - 600, // session timeout exceeded
      lastHeartbeatAt: Date.now() - 200, // idle timeout exceeded
      lastActionAt: Date.now() - 200,
    };

    reclaimer.registerBrowser(browser);

    const result = await reclaimer.reclaimZombies();
    expect(result.reclaimedCount).toBe(1);
    expect(result.reclaimedInstances[0].browserId).toBe("brw_zombie");
    expect(killedPids).toContain(99991);
    expect(killedPids).toContain(99992);
    expect(killedPids).toContain(99993);
    expect(cleanedDirs).toContain(profileDir);
    expect(existsSync(profileDir)).toBe(false);

    // Subsequent list should be empty
    expect(reclaimer.listBrowsers().length).toBe(0);
  });

  it("supports manual termination and heartbeat renewal", async () => {
    const profileDir = join(testDir, "profile_manual");
    mkdirSync(profileDir, { recursive: true });

    const browser: BrowserInstanceRecord = {
      browserId: "brw_manual",
      sessionId: "sess_man",
      agentId: "agent_03",
      taskId: "task_03",
      pid: 8888,
      childPids: [],
      userDataDir: profileDir,
      timeouts: {
        navigationTimeoutMs: 1000,
        actionTimeoutMs: 1000,
        sessionTimeoutMs: 10000,
        idleTimeoutMs: 5000,
      },
      state: "IDLE",
      launchedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      lastActionAt: Date.now(),
    };

    reclaimer.registerBrowser(browser);

    const hbResult = reclaimer.heartbeat("brw_manual");
    expect(hbResult).toBe(true);
    expect(reclaimer.getBrowser("brw_manual")?.state).toBe("ACTIVE");

    const termResult = await reclaimer.terminateBrowser("brw_manual", "USER_REQUEST");
    expect(termResult).toBe(true);
    expect(killedPids).toContain(8888);
    expect(reclaimer.getBrowser("brw_manual")).toBeUndefined();
  });
});
