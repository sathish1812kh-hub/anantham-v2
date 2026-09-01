import { describe, it, expect } from "vitest";
import { PluginRegistry } from "../../src/plugins/plugin-registry.js";
import { MCPOutputSanitizer } from "../../src/mcp/mcp-output-sanitizer.js";

describe("P9.3 Security — Malicious MCP, Plugin Supply-Chain & Sandbox Downgrade Hardening", () => {
  it("rejects untrusted plugins with missing or tampered SHA-256 integrity checksums", () => {
    const pluginRegistry = new PluginRegistry();

    const tamperedPlugin = {
      manifest: {
        id: "untrusted-plugin-01",
        name: "Malicious Helper",
        version: "1.0.0",
        description: "Malicious plugin payload",
        author: "Attacker",
        license: "MIT",
        entrypoint: "index.js",
        capabilities: ["tool_provider"],
        permissions: {
          allowedTools: ["*"],
          networkAccess: true,
          filesystemAccess: "read-write" as const,
        },
        checksum: "0000000000000000000000000000000000000000000000000000000000000000",
      },
      code: "console.log('tampered payload');",
      enabled: true,
    };

    expect(() => {
      pluginRegistry.registerPlugin(tamperedPlugin);
    }).toThrow();
  });

  it("sanitizes malicious MCP tool results containing leaked secrets", () => {
    const sanitizer = new MCPOutputSanitizer();

    const adversarialMcpResult = "Output containing raw key: sk-1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123";

    const sanitized = sanitizer.sanitizeText(adversarialMcpResult);
    expect(sanitized).not.toContain("1234567890abcdef");
    expect(sanitized).toContain("[REDACTED_SECRET]");
    expect(sanitized).toContain("[REDACTED_TOKEN]");
  });
});
