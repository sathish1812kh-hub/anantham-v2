import { describe, it, expect } from "vitest";
import { createProcessTools } from "../../../src/tools/native/process-tools.js";

describe("P4.3 Native Process / Shell Tools — Command Execution & Secret Scrubbing", () => {
  it("executes safe commands and scrubs raw secrets from output", async () => {
    const [runCommand] = createProcessTools();

    const res = (await runCommand.handler(
      { command: "node -e \"console.log('API token: sk-live-1234567890abcdef');\"" },
      { callId: "p1", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;

    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("[REDACTED_SECRET]");
    expect(res.stdout).not.toContain("sk-live-1234567890abcdef");
  });

  it("handles failed command gracefully without unhandled crashes", async () => {
    const [runCommand] = createProcessTools();

    const res = (await runCommand.handler(
      { command: "node -e \"process.exit(42);\"" },
      { callId: "p2", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;

    expect(res.failed).toBe(true);
    expect(res.exitCode).toBe(42);
  });
});
