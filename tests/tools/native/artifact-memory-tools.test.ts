import { describe, it, expect } from "vitest";
import { createArtifactTools } from "../../../src/tools/native/artifact-tools.js";
import { createMemoryTools } from "../../../src/tools/native/memory-tools.js";

describe("P4.3 Native Artifact & Memory Tools", () => {
  it("saves and reads artifacts verifying cryptographic SHA-256 hash", async () => {
    const [saveArtifact, readArtifact] = createArtifactTools();

    const saveRes = (await saveArtifact.handler(
      { name: "build_output.log", content: "Build succeeded 100%" },
      { callId: "a1", actor: { id: "agent_ci", type: "agent" }, project: { id: "p1" } }
    )) as any;

    expect(saveRes.artifactId).toBeDefined();
    expect(saveRes.hash).toBeDefined();

    const readRes = (await readArtifact.handler(
      { artifactId: saveRes.artifactId },
      { callId: "a2", actor: { id: "agent_ci", type: "agent" }, project: { id: "p1" } }
    )) as any;

    expect(readRes.content).toBe("Build succeeded 100%");
    expect(readRes.hash).toBe(saveRes.hash);
  });

  it("stores and retrieves scoped memories", async () => {
    const [storeMemory, retrieveMemory] = createMemoryTools();

    const storeRes = (await storeMemory.handler(
      { namespace: "preferences", key: "theme", content: "dark mode" },
      { callId: "m1", actor: { id: "user_dev", type: "user" }, project: { id: "p1" } }
    )) as any;
    expect(storeRes.stored).toBe(true);

    const retrieveRes = (await retrieveMemory.handler(
      { namespace: "preferences", query: "theme" },
      { callId: "m2", actor: { id: "user_dev", type: "user" }, project: { id: "p1" } }
    )) as any;

    expect(retrieveRes.count).toBe(1);
    expect(retrieveRes.memories[0].content).toBe("dark mode");
  });
});
