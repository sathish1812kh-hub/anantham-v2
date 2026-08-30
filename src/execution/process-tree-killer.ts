import { exec } from "node:child_process";
import os from "node:os";

/**
 * Cross-platform process tree termination helper.
 * Ensures parent process and all spawned child/grandchild processes are killed.
 */
export async function killProcessTree(pid: number, signal: NodeJS.Signals = "SIGKILL"): Promise<boolean> {
  if (!pid || pid <= 0) return false;

  const isWindows = os.platform() === "win32";

  if (isWindows) {
    return new Promise<boolean>((resolve) => {
      exec(`taskkill /pid ${pid} /t /f`, (_err) => {
        // Even if error (e.g. process already exited), resolve gracefully
        resolve(true);
      });
    });
  }

  return new Promise<boolean>((resolve) => {
    try {
      // Negative PID kills the process group on POSIX systems
      process.kill(-pid, signal);
      resolve(true);
    } catch {
      try {
        process.kill(pid, signal);
        resolve(true);
      } catch {
        resolve(false);
      }
    }
  });
}
