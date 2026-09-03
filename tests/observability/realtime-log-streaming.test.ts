import { describe, it, expect } from "vitest";
import { LogStreamerSse, type LogStreamMessage } from "../../src/observability/log-streamer-sse.js";

describe("PRD-PART2-309: Real-Time Log Streaming via WebSocket / SSE", () => {
  it("streams messages to filtered subscribers and formats SSE event payloads", () => {
    const streamer = new LogStreamerSse();
    const received: LogStreamMessage[] = [];

    const unsubscribe = streamer.subscribe({
      id: "sub_1",
      channelFilter: "session:100",
      minLevel: "info",
      onMessage: (msg) => received.push(msg),
    });

    // 1. Matches channel and level
    const msg1 = streamer.publish("session:100", "info", "Task started");
    expect(received.length).toBe(1);

    // 2. Filtered out by level (debug < info)
    streamer.publish("session:100", "debug", "Verbose debug trace");
    expect(received.length).toBe(1);

    // 3. Filtered out by channel (session:200 != session:100)
    streamer.publish("session:200", "error", "Different session error");
    expect(received.length).toBe(1);

    // Format SSE
    const sse = streamer.formatSseEvent(msg1);
    expect(sse).toContain("event: log");
    expect(sse).toContain("Task started");

    unsubscribe();
    expect(streamer.getSubscriberCount()).toBe(0);
  });
});
