import { describe, it, expect } from "vitest";
import { ProcessSupervisor } from "../../src/execution/process-supervisor.js";

describe("P4.4 ProcessSupervisor — Lifecycle State Transitions", () => {
  it("enforces valid lifecycle progression created -> starting -> running -> completing -> completed", () => {
    const supervisor = new ProcessSupervisor();

    const handle = supervisor.register({
      executionId: "exec_sup_01",
      command: "echo test",
    });
    expect(handle.state).toBe("created");

    supervisor.transition("exec_sup_01", "starting");
    expect(supervisor.getHandle("exec_sup_01")?.state).toBe("starting");

    supervisor.transition("exec_sup_01", "running");
    expect(supervisor.getHandle("exec_sup_01")?.state).toBe("running");

    supervisor.transition("exec_sup_01", "completing");
    expect(supervisor.getHandle("exec_sup_01")?.state).toBe("completing");

    supervisor.transition("exec_sup_01", "completed");
    expect(supervisor.getHandle("exec_sup_01")?.state).toBe("completed");
  });

  it("rejects invalid transitions from terminal states", () => {
    const supervisor = new ProcessSupervisor();
    supervisor.register({ executionId: "exec_sup_02", command: "echo test" });
    supervisor.transition("exec_sup_02", "starting");
    supervisor.transition("exec_sup_02", "failed");

    expect(() => supervisor.transition("exec_sup_02", "running")).toThrow(
      'Invalid lifecycle transition from terminal state "failed" to "running"'
    );
  });
});
