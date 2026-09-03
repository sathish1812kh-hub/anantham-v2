import { describe, it, expect } from "vitest";
import { AudioTranscriptionEngine } from "../../src/multimodal/audio-transcription-engine.js";

describe("PRD-PART2-304: Audio Recording & Transcription Subsystem", () => {
  it("transcribes audio buffers, calculates duration from PCM stream, and segments transcription", async () => {
    const engine = new AudioTranscriptionEngine();

    // 16kHz mono 16-bit PCM = 32000 bytes per second
    // 64000 bytes = 2.0 seconds
    const audioBuffer = Buffer.alloc(64000);

    const result = await engine.transcribe(audioBuffer, 16000);
    expect(result.durationSeconds).toBe(2.0);
    expect(result.text).toBeDefined();
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.9);
  });
});
