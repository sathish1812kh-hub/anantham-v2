import { describe, it, expect } from "vitest";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";

describe("P8.2 TUI — Secret & Credential Redaction", () => {
  const renderer = new TuiRenderer({ redactSecrets: true });

  it("redacts secret fields recursively in data objects", () => {
    const sensitive = {
      service: "Claude",
      apiKey: "sk-ant-api03-secret12345",
      userToken: "jwt-token-abcdef",
      config: {
        password: "my-secret-password",
        nodeName: "SafeNode",
      },
    };

    const redacted = renderer.redactData(sensitive) as any;

    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.userToken).toBe("[REDACTED]");
    expect(redacted.config.password).toBe("[REDACTED]");
    expect(redacted.config.nodeName).toBe("SafeNode");
  });
});
