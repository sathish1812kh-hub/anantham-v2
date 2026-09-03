import { describe, it, expect } from "vitest";
import { WindowsBoundaryGuard } from "../../src/security/windows-boundary-guard.js";
import { DangerousCommandHeuristics } from "../../src/security/dangerous-command-heuristics.js";
import { ComplianceAuditLogger } from "../../src/observability/compliance-audit-logger.js";
import { AntiContaminationGuard } from "../../src/evaluation/anti-contamination-guard.js";
import { ProcessBoundsManager } from "../../src/execution/process-bounds-manager.js";

describe("Milestone 6: Adversarial & Fault Injection Hardening Suite", () => {
  it("rejects malicious Windows reserved device names and NTFS Alternate Data Streams", () => {
    const guard = new WindowsBoundaryGuard();

    expect(guard.validateWindowsPath("CON.txt").isSafe).toBe(false);
    expect(guard.validateWindowsPath("C:\\path\\nul").isSafe).toBe(false);
    expect(guard.validateWindowsPath("C:\\path\\COM1").isSafe).toBe(false);
    expect(guard.validateWindowsPath("secret.txt:hidden_stream").isSafe).toBe(false);
    expect(guard.validateWindowsPath("safe_file.ts").isSafe).toBe(true);
  });

  it("detects destructive commands, fork bombs, and base64 shell execution", () => {
    const heuristics = new DangerousCommandHeuristics();

    const rootDelete = heuristics.analyzeCommand("rm -rf /");
    expect(rootDelete.isDangerous).toBe(true);
    expect(rootDelete.severity).toBe("critical");

    const forkBomb = heuristics.analyzeCommand(":(){ :|:& };:");
    expect(forkBomb.isDangerous).toBe(true);
    expect(forkBomb.severity).toBe("critical");

    const obfuscated = heuristics.analyzeCommand("echo aGVsbG8gd29ybGQgZnJvbSBhbmFudGhhbQ== | base64 -d | bash");
    expect(obfuscated.isDangerous).toBe(true);
    expect(obfuscated.severity).toBe("high");

    const safeCmd = heuristics.analyzeCommand("npm test");
    expect(safeCmd.isDangerous).toBe(false);
  });

  it("detects any bit-level tampering in the compliance audit hash chain", () => {
    const logger = new ComplianceAuditLogger();
    logger.logEvent("user_1", "create", "file_a", { a: 1 });
    logger.logEvent("user_2", "update", "file_b", { b: 2 });
    logger.logEvent("user_3", "delete", "file_c", { c: 3 });

    expect(logger.verifyChainIntegrity().isValid).toBe(true);

    // Tamper with middle event
    const events = logger.getEvents();
    events[1]!.action = "unauthorized_tamper";

    const verifyTampered = logger.verifyChainIntegrity();
    expect(verifyTampered.isValid).toBe(false);
    expect(verifyTampered.brokenAtSequence).toBe(2);
  });

  it("detects prompt contamination against benchmark datasets", () => {
    const guard = new AntiContaminationGuard();
    guard.registerBenchmarkDataset("SWE-bench", [
      "django.contrib.auth.models.AnonymousUser",
    ]);

    const contaminated = guard.detectContamination(
      "SWE-bench",
      "django.contrib.auth.models.AnonymousUser"
    );
    expect(contaminated.contaminated).toBe(true);

    const safe = guard.detectContamination("SWE-bench", "A completely different user prompt");
    expect(safe.contaminated).toBe(false);
  });

  it("truncates process output cleanly when maxBufferBytes limit is reached", () => {
    const mgr = new ProcessBoundsManager();
    const giantOutput = "X".repeat(5000);
    const capped = mgr.enforceBufferLimit(giantOutput, 1000);

    expect(capped.length).toBeLessThanOrEqual(1050);
    expect(capped).toContain("[TRUNCATED: max buffer exceeded]");
  });
});
