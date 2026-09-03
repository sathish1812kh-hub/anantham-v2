/**
 * Real-Time Log Streaming via SSE / WebSocket
 * PRD-PART2-309: Real-Time Log Streaming via WebSocket / SSE
 */

export interface LogStreamMessage {
  id: string;
  channel: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface StreamSubscriber {
  id: string;
  channelFilter?: string;
  minLevel?: "debug" | "info" | "warn" | "error";
  onMessage: (msg: LogStreamMessage) => void;
}

export class LogStreamerSse {
  private subscribers: Map<string, StreamSubscriber> = new Map();
  private history: LogStreamMessage[] = [];
  private static readonly LEVEL_RANK = { debug: 1, info: 2, warn: 3, error: 4 };

  public subscribe(subscriber: StreamSubscriber): () => void {
    this.subscribers.set(subscriber.id, subscriber);
    return () => this.subscribers.delete(subscriber.id);
  }

  public publish(
    channel: string,
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: Record<string, unknown>
  ): LogStreamMessage {
    const msg: LogStreamMessage = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      channel,
      level,
      message,
      timestamp: Date.now(),
      metadata,
    };

    this.history.push(msg);
    if (this.history.length > 500) {
      this.history.shift();
    }

    // Broadcast to matching subscribers
    for (const sub of this.subscribers.values()) {
      if (sub.channelFilter && sub.channelFilter !== "*" && sub.channelFilter !== channel) {
        continue;
      }
      if (sub.minLevel && LogStreamerSse.LEVEL_RANK[level] < LogStreamerSse.LEVEL_RANK[sub.minLevel]) {
        continue;
      }
      try {
        sub.onMessage(msg);
      } catch {
        // ignore subscriber delivery error
      }
    }

    return msg;
  }

  public formatSseEvent(msg: LogStreamMessage): string {
    return `id: ${msg.id}\nevent: log\ndata: ${JSON.stringify(msg)}\n\n`;
  }

  public getSubscriberCount(): number {
    return this.subscribers.size;
  }
}
