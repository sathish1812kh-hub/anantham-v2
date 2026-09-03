import { existsSync, rmSync } from "node:fs";
import { z } from "zod";
import { EventStore } from "../event-state/event-store.js";
import { LeaseManager } from "./lease-manager.js";

export const BrowserSessionStateSchema = z.enum([
  "LAUNCHING",
  "ACTIVE",
  "NAVIGATING",
  "EXECUTING_ACTION",
  "IDLE",
  "TIMED_OUT",
  "TERMINATING",
  "TERMINATED",
  "ZOMBIE",
]);
export type BrowserSessionState = z.infer<typeof BrowserSessionStateSchema>;

export const BrowserTimeoutConfigSchema = z.object({
  navigationTimeoutMs: z.number().int().positive().default(30_000),
  actionTimeoutMs: z.number().int().positive().default(15_000),
  sessionTimeoutMs: z.number().int().positive().default(300_000),
  idleTimeoutMs: z.number().int().positive().default(60_000),
});
export type BrowserTimeoutConfig = z.infer<typeof BrowserTimeoutConfigSchema>;

export const BrowserInstanceRecordSchema = z.object({
  browserId: z.string().min(1),
  sessionId: z.string().min(1),
  agentId: z.string().min(1),
  taskId: z.string().min(1),
  pid: z.number().int().positive(),
  childPids: z.array(z.number().int().positive()).default([]),
  userDataDir: z.string().min(1),
  timeouts: BrowserTimeoutConfigSchema.default({}),
  state: BrowserSessionStateSchema.default("ACTIVE"),
  launchedAt: z.number().int().positive(),
  lastHeartbeatAt: z.number().int().positive(),
  lastActionAt: z.number().int().positive(),
});
export type BrowserInstanceRecord = z.infer<typeof BrowserInstanceRecordSchema>;

export const BrowserReclamationResultSchema = z.object({
  reclaimedCount: z.number().int().nonnegative(),
  reclaimedInstances: z.array(
    z.object({
      browserId: z.string(),
      pid: z.number(),
      reason: z.enum(["SESSION_TIMEOUT", "IDLE_TIMEOUT", "AGENT_CRASHED", "MANUAL_ABORT", "ACTION_TIMEOUT"]),
      cleanedUserDataDir: z.boolean(),
      durationMs: z.number(),
    })
  ),
  errors: z.array(z.string()),
  timestamp: z.string(),
});
export type BrowserReclamationResult = z.infer<typeof BrowserReclamationResultSchema>;

export interface BrowserZombieReclaimerOptions {
  eventStore?: EventStore;
  leaseManager?: LeaseManager;
  processKiller?: (pid: number) => Promise<boolean>;
  fsCleaner?: (dirPath: string) => Promise<void>;
}

export class BrowserZombieReclaimer {
  private readonly instances: Map<string, BrowserInstanceRecord> = new Map();
  private readonly eventStore?: EventStore;
    private readonly processKiller: (pid: number) => Promise<boolean>;
  private readonly fsCleaner: (dirPath: string) => Promise<void>;

  constructor(options: BrowserZombieReclaimerOptions = {}) {
    this.eventStore = options.eventStore;
        this.processKiller = options.processKiller ?? (async (pid) => {
      try {
        process.kill(pid, "SIGKILL");
        return true;
      } catch {
        return false;
      }
    });
    this.fsCleaner = options.fsCleaner ?? (async (dirPath) => {
      if (existsSync(dirPath)) {
        try {
          rmSync(dirPath, { recursive: true, force: true });
        } catch {}
      }
    });
  }

  public registerBrowser(instance: BrowserInstanceRecord): void {
    const validated = BrowserInstanceRecordSchema.parse(instance);
    this.instances.set(validated.browserId, validated);
  }

  public getBrowser(browserId: string): BrowserInstanceRecord | undefined {
    return this.instances.get(browserId);
  }

  public listBrowsers(): BrowserInstanceRecord[] {
    return Array.from(this.instances.values());
  }

  public heartbeat(browserId: string): boolean {
    const instance = this.instances.get(browserId);
    if (!instance || instance.state === "TERMINATED") {
      return false;
    }
    instance.lastHeartbeatAt = Date.now();
    if (instance.state === "IDLE") {
      instance.state = "ACTIVE";
    }
    return true;
  }

  public async executeWithTimeout<T>(
    browserId: string,
    type: "navigation" | "action",
    actionFn: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const instance = this.instances.get(browserId);
    if (!instance) {
      throw new Error("Browser instance not found: " + browserId);
    }

    const timeoutLimit = type === "navigation"
      ? instance.timeouts.navigationTimeoutMs
      : instance.timeouts.actionTimeoutMs;

    instance.state = type === "navigation" ? "NAVIGATING" : "EXECUTING_ACTION";
    instance.lastActionAt = Date.now();

    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        instance.state = "TIMED_OUT";
        controller.abort();
        reject(new Error(`[BrowserZombieReclaimer] Browser ${type} timed out after ${timeoutLimit}ms.`));
      }, timeoutLimit);
    });

    try {
      const result = await Promise.race([actionFn(controller.signal), timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      instance.state = "ACTIVE";
      instance.lastHeartbeatAt = Date.now();
      return result;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      throw err;
    }
  }

  public async reclaimZombies(now: number = Date.now()): Promise<BrowserReclamationResult> {
    const reclaimedInstances: BrowserReclamationResult["reclaimedInstances"] = [];
    const errors: string[] = [];

    for (const [browserId, instance] of Array.from(this.instances.entries())) {
      if (instance.state === "TERMINATED") {
        continue;
      }

      let shouldReclaim = false;
      let reason: "SESSION_TIMEOUT" | "IDLE_TIMEOUT" | "AGENT_CRASHED" | "MANUAL_ABORT" | "ACTION_TIMEOUT" = "IDLE_TIMEOUT";

      if (now - instance.launchedAt > instance.timeouts.sessionTimeoutMs) {
        shouldReclaim = true;
        reason = "SESSION_TIMEOUT";
      } else if (now - instance.lastHeartbeatAt > instance.timeouts.idleTimeoutMs) {
        shouldReclaim = true;
        reason = "IDLE_TIMEOUT";
      } else if (instance.state === "TIMED_OUT") {
        shouldReclaim = true;
        reason = "ACTION_TIMEOUT";
      }

      if (shouldReclaim) {
        const start = Date.now();
        try {
          // Kill parent process and child processes
          await this.processKiller(instance.pid);
          for (const childPid of instance.childPids) {
            await this.processKiller(childPid);
          }

          // Clean temp user data dir
          await this.fsCleaner(instance.userDataDir);

          instance.state = "TERMINATED";
          this.instances.delete(browserId);

          if (this.eventStore) {
            this.eventStore.append({
              id: "evt_brw_rec_" + Date.now(),
              schemaVersion: 1,
              sessionId: instance.sessionId,
              taskId: instance.taskId,
              type: "recovery.browser_reclaimed",
              actor: "system",
              timestamp: new Date().toISOString(),
              payload: {
                browserId,
                pid: instance.pid,
                reason,
              },
            });
          }

          reclaimedInstances.push({
            browserId,
            pid: instance.pid,
            reason,
            cleanedUserDataDir: true,
            durationMs: Date.now() - start,
          });
        } catch (err: any) {
          errors.push(`Failed to reclaim browser ${browserId}: ${err.message}`);
        }
      }
    }

    return {
      reclaimedCount: reclaimedInstances.length,
      reclaimedInstances,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

  public async terminateBrowser(browserId: string, reason: string = "MANUAL_ABORT"): Promise<boolean> {
    const instance = this.instances.get(browserId);
    if (!instance) {
      return false;
    }

    await this.processKiller(instance.pid);
    for (const childPid of instance.childPids) {
      await this.processKiller(childPid);
    }
    await this.fsCleaner(instance.userDataDir);

    instance.state = "TERMINATED";
    this.instances.delete(browserId);

    if (this.eventStore) {
      this.eventStore.append({
        id: "evt_brw_term_" + Date.now(),
        schemaVersion: 1,
        sessionId: instance.sessionId,
        taskId: instance.taskId,
        type: "recovery.browser_terminated",
        actor: "system",
        timestamp: new Date().toISOString(),
        payload: {
          browserId,
          pid: instance.pid,
          reason,
        },
      });
    }

    return true;
  }
}
