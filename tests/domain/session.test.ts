import { describe, it, expect } from "vitest";
import {
  SessionSchema,
  SessionStatusSchema,
  type Session,
} from "../../src/domain/session.js";

describe("Session Domain Contracts", () => {
  it("validates a Session record", () => {
    const session: Session = {
      id: "sess_01",
      projectId: "proj_01",
      name: "initial-bootstrap",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default-pool",
      mode: "supervised",
      permissions: {
        "filesystem.read": true,
        "filesystem.write": true,
        "shell.execute": "approval_required",
      },
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:30:00.000Z",
    };

    const parsed = SessionSchema.parse(session);
    expect(parsed).toEqual(session);
  });

  it("validates session statuses", () => {
    const statuses = ["active", "paused", "completed", "archived"];
    for (const s of statuses) {
      expect(SessionStatusSchema.parse(s)).toBe(s);
    }
  });
});
