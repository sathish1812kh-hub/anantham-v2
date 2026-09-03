import { describe, it, expect } from "vitest";
import { ComplianceAuditLogger } from "../../src/observability/compliance-audit-logger.js";

describe("PRD-OBS-003: Audit Logging & Compliance Event Trail", () => {
  it("builds an immutable cryptographic hash chain and detects tampering", () => {
    const logger = new ComplianceAuditLogger();

    logger.logEvent("user_admin", "change_policy", "security_policy", { allowNetwork: false });
    logger.logEvent("agent_coder", "execute_tool", "run_command", { cmd: "npm test" });
    logger.logEvent("user_admin", "export_data", "project_backup", { format: "tar.gz" });

    const events = logger.getEvents();
    expect(events.length).toBe(3);
    expect(events[1].previousHash).toBe(events[0].recordHash);
    expect(events[2].previousHash).toBe(events[1].recordHash);

    // Initial chain is valid
    expect(logger.verifyChainIntegrity().isValid).toBe(true);

    // Tampering with payloadHash breaks integrity
    events[1].payloadHash = "TAMPERED_HASH";
    const verification = logger.verifyChainIntegrity();
    expect(verification.isValid).toBe(false);
    expect(verification.brokenAtSequence).toBe(2);
  });
});
