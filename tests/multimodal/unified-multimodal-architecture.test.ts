import { describe, it, expect } from "vitest";
import { MultimodalOrchestrator } from "../../src/multimodal/multimodal-orchestrator.js";

describe("PRD-MM-001: Unified Multimodal Architecture", () => {
  it("exposes all coordinated multimodal pipelines through the central orchestrator", () => {
    const orchestrator = new MultimodalOrchestrator();

    expect(orchestrator.getImageProcessor()).toBeDefined();
    expect(orchestrator.getPerceptualHasher()).toBeDefined();
    expect(orchestrator.getScreenEngine()).toBeDefined();
    expect(orchestrator.getDocumentExtractor()).toBeDefined();
    expect(orchestrator.getContextInjector()).toBeDefined();
    expect(orchestrator.getOcrPipeline()).toBeDefined();
    expect(orchestrator.getAudioEngine()).toBeDefined();
  });
});
