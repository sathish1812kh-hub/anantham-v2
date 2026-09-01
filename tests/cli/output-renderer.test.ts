import { describe, it, expect } from "vitest";
import { OutputRenderer } from "../../src/cli/output-renderer.js";

describe("P8.1 CLI — Output Renderer & Secret Redaction", () => {
  it("renders human-readable text for successful and failed commands", () => {
    const renderer = new OutputRenderer({ mode: "text" });

    const successRes = {
      success: true,
      commandName: "project",
      message: "Active project set to 'Alpha'",
      data: { id: "proj_01", name: "Alpha" },
      exitRequested: false,
    };

    const renderedSuccess = renderer.renderResult(successRes);
    expect(renderedSuccess).toContain("✔ Active project set to 'Alpha'");
    expect(renderedSuccess).toContain('"id": "proj_01"');

    const failRes = {
      success: false,
      commandName: "task",
      error: "Task not found",
      classification: "NOT_FOUND",
      exitRequested: false,
    };

    const renderedFail = renderer.renderResult(failRes);
    expect(renderedFail).toContain("✖ Command /task failed: Task not found");
    expect(renderedFail).toContain("Classification: NOT_FOUND");
  });

  it("renders structured JSON and JSONL output", () => {
    const jsonRenderer = new OutputRenderer({ mode: "json" });
    const jsonlRenderer = new OutputRenderer({ mode: "jsonl" });

    const result = {
      success: true,
      commandName: "doctor",
      data: { status: "OK" },
      exitRequested: false,
    };

    const jsonOut = jsonRenderer.renderResult(result);
    const parsedJson = JSON.parse(jsonOut);
    expect(parsedJson.commandName).toBe("doctor");

    const jsonlOut = jsonlRenderer.renderResult(result);
    expect(jsonlOut).not.toContain("\n");
    const parsedJsonl = JSON.parse(jsonlOut);
    expect(parsedJsonl.commandName).toBe("doctor");
  });

  it("automatically redacts sensitive secret keys in data and output", () => {
    const renderer = new OutputRenderer({ mode: "json", redactSecrets: true });

    const dataWithSecrets = {
      service: "OpenAI",
      apiKey: "sk-proj-secret-token-12345",
      authToken: "bearer-token-abcde",
      nested: {
        password: "supersecretpass",
        publicName: "SafeName",
      },
    };

    const rendered = renderer.renderData(dataWithSecrets);
    const parsed = JSON.parse(rendered);

    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.authToken).toBe("[REDACTED]");
    expect(parsed.nested.password).toBe("[REDACTED]");
    expect(parsed.nested.publicName).toBe("SafeName");
  });
});
