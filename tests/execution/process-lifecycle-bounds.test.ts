import { describe, it, expect } from "vitest";
import { ProcessBoundsManager } from "../../src/execution/process-bounds-manager.js";

describe("PRD-EXEC-005: Process Lifecycle & Resource Bounds", () => {
  const boundsMgr = new ProcessBoundsManager();

  it("enforces execution timeout and terminates bounded process cleanly", async () => {
    // Run a command that takes longer than timeout
    const isWin = process.platform === "win32";
    const cmd = isWin ? "powershell.exe" : "sleep";
    const args = isWin ? ["-Command", "Start-Sleep -Milliseconds 500"] : ["1"];

    const result = await boundsMgr.executeBoundedProcess(cmd, args, process.cwd(), {
      timeoutMs: 50,
      maxBufferBytes: 1024,
    });

    expect(result.timedOut).toBe(true);
  });

  it("truncates output when exceeding maxBufferBytes", async () => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "powershell.exe" : "echo";
    const args = isWin
      ? ["-Command", "'A' * 2000"]
      : ["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"];

    const result = await boundsMgr.executeBoundedProcess(cmd, args, process.cwd(), {
      timeoutMs: 3000,
      maxBufferBytes: 50,
    });

    expect(result.stdout.length).toBeLessThanOrEqual(50);
    expect(result.truncated).toBe(true);
  });
});
