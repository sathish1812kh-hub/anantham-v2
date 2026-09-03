import { describe, it, expect } from "vitest";
import { NotificationManager } from "../../src/cli/notification-manager.js";

describe("PRD-PART2-211: Terminal Bell, Audio Cues & OS Desktop Notifications", () => {
  it("emits ASCII bell escape sequence and logs notification payloads", () => {
    const mgr = new NotificationManager("full");

    const bell = mgr.triggerBell();
    expect(bell).toBe("\x07");
    expect(mgr.getBellCount()).toBe(1);

    const delivery = mgr.notify({
      title: "Task Complete",
      message: "Build succeeded in 2.3s",
      urgency: "normal",
      sound: true,
    });

    expect(delivery.delivered).toBe(true);
    expect(delivery.bellEmitted).toBe(true);
    expect(mgr.getHistory().length).toBe(1);
    expect(mgr.getBellCount()).toBe(2);
  });

  it("suppresses bells and deliveries when set to silent mode", () => {
    const mgr = new NotificationManager("silent");

    expect(mgr.triggerBell()).toBe("");
    const delivery = mgr.notify({ title: "Silent", message: "Quiet" });
    expect(delivery.delivered).toBe(false);
    expect(mgr.getBellCount()).toBe(0);
  });
});
