import { describe, it, expect } from "vitest";
import { WindowsBoundaryGuard } from "../../src/security/windows-boundary-guard.js";

describe("PRD-PART2-108: Native Windows Host Execution Boundaries", () => {
  const guard = new WindowsBoundaryGuard();

  it("identifies and blocks DOS reserved device names in file paths", () => {
    expect(guard.validateWindowsPath("C:\\workspace\\CON.txt").isSafe).toBe(false);
    expect(guard.validateWindowsPath("C:\\workspace\\NUL").isSafe).toBe(false);
    expect(guard.validateWindowsPath("C:\\workspace\\AUX.json").isSafe).toBe(false);
    expect(guard.validateWindowsPath("C:\\workspace\\com1.log").isSafe).toBe(false);
  });

  it("detects and blocks NTFS Alternate Data Streams (ADS)", () => {
    expect(guard.validateWindowsPath("C:\\workspace\\normal.txt:hidden_payload").isSafe).toBe(false);
    expect(guard.validateWindowsPath("C:\\workspace\\test.js:$DATA").isSafe).toBe(false);
  });

  it("detects trailing dot or space escapes that bypass Windows security checks", () => {
    expect(guard.validateWindowsPath("C:\\workspace\\malicious.txt.").isSafe).toBe(false);
    expect(guard.validateWindowsPath("C:\\workspace\\malicious.txt ").isSafe).toBe(false);
  });

  it("identifies Windows shell execution types and sanitizes arguments", () => {
    expect(guard.detectShellType("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("pwsh");
    expect(guard.detectShellType("powershell.exe")).toBe("powershell");
    expect(guard.detectShellType("cmd.exe")).toBe("cmd");

    const sanitized = guard.sanitizeWindowsShellArgs(["foo&bar", "%PATH%"], "cmd");
    expect(sanitized[0]).toBe("foo^&bar");
    expect(sanitized[1]).toBe("^%PATH^%");
  });
});
