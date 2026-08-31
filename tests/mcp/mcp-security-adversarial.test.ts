import { describe, it, expect } from "vitest";
import { MCPOutputSanitizer } from "../../src/mcp/mcp-output-sanitizer.js";
import { MCPClient } from "../../src/mcp/mcp-client.js";

describe("P5.1 MCP Security & Adversarial Hardening", () => {
  it("scrubs leaked secrets and API keys from MCP outputs", () => {
    const sanitizer = new MCPOutputSanitizer();

    const outputWithSecret = "Connected with secret sk-1234567890abcdefghijklmn and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const cleaned = sanitizer.sanitizeText(outputWithSecret);

    expect(cleaned).toContain("[REDACTED_SECRET]");
    expect(cleaned).toContain("[REDACTED_TOKEN]");
    expect(cleaned).not.toContain("sk-1234567890abcdefghijklmn");
  });

  it("bounds oversized payloads and truncates safely", () => {
    const sanitizer = new MCPOutputSanitizer({ maxOutputBytes: 100 });
    const hugeText = "A".repeat(500);

    const cleaned = sanitizer.sanitizeText(hugeText);
    expect(cleaned).toContain("[OUTPUT_TRUNCATED: Exceeded byte limit]");
  });

  it("blocks execution when MCP server is disabled", async () => {
    const client = new MCPClient({
      config: {
        id: "srv_disabled",
        name: "Disabled Server",
        transport: "stdio",
        enabled: false,
      },
    });

    await expect(client.connect()).rejects.toThrow(/is disabled/);
  });
});
