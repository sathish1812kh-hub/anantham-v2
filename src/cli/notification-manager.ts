/**
 * Terminal Bell, Audio Cues & Desktop Notification Manager
 * PRD-PART2-211: Terminal Bell, Audio Cues & OS Desktop Notifications
 */

export type NotificationMode = "silent" | "bell_only" | "full";

export interface NotificationPayload {
  title: string;
  message: string;
  urgency?: "low" | "normal" | "critical";
  sound?: boolean;
}

export class NotificationManager {
  private mode: NotificationMode;
  private notificationLog: NotificationPayload[] = [];
  private bellCount = 0;

  constructor(mode: NotificationMode = "full") {
    this.mode = mode;
  }

  public setMode(mode: NotificationMode): void {
    this.mode = mode;
  }

  public getMode(): NotificationMode {
    return this.mode;
  }

  public triggerBell(): string {
    if (this.mode === "silent") return "";
    this.bellCount++;
    return "\x07"; // ASCII Bell
  }

  public notify(payload: NotificationPayload): { delivered: boolean; mode: NotificationMode; bellEmitted: boolean } {
    if (this.mode === "silent") {
      return { delivered: false, mode: this.mode, bellEmitted: false };
    }

    let bellEmitted = false;
    if (payload.sound !== false) {
      this.triggerBell();
      bellEmitted = true;
    }

    this.notificationLog.push(payload);

    return {
      delivered: true,
      mode: this.mode,
      bellEmitted,
    };
  }

  public getHistory(): NotificationPayload[] {
    return [...this.notificationLog];
  }

  public getBellCount(): number {
    return this.bellCount;
  }
}
