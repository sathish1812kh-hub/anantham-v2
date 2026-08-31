import { describe, it, expect } from "vitest";
import { SkillRegistry } from "../../src/skills/skill-registry.js";
import { SkillParser } from "../../src/skills/skill-parser.js";

describe("P5.3 Skills — Exact Version Pinning & Project Isolation", () => {
  const registry = new SkillRegistry();
  const parser = new SkillParser();

  const manifest = parser.parse(`---
name: security-audit
description: Security scanning procedure.
version: 2.0.0
---
# Security Audit
## Procedure
1. Scan ports.
`);

  it("locks skill version per project and preserves pin against global upgrades", () => {
    registry.register(manifest);

    // Project Alpha pins to v1.0.0
    registry.setProjectPins("prj_alpha", {
      "security-audit": "1.0.0",
    });

    const alphaSkill = registry.getEffectiveSkill("security-audit", "prj_alpha");
    expect(alphaSkill?.projectPin).toBe("1.0.0");

    // Project Beta (unpinned) gets active 2.0.0
    const betaSkill = registry.getEffectiveSkill("security-audit", "prj_beta");
    expect(betaSkill?.projectPin).toBeUndefined();
    expect(betaSkill?.manifest.metadata.version).toBe("2.0.0");
  });
});
