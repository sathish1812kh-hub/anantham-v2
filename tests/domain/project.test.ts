import { describe, it, expect } from "vitest";
import {
  ProjectSchema,
  ProjectStatusSchema,
  TrustProfileSchema,
  type Project,
} from "../../src/domain/project.js";

describe("Project Domain Contracts", () => {
  it("validates a Project configuration", () => {
    const project: Project = {
      id: "proj_01",
      name: "anantham-core",
      rootPath: "C:/herness",
      status: "active",
      tags: ["typescript", "runtime", "agents"],
      modelProfile: "balanced",
      memoryNamespace: "project/proj_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:30:00.000Z",
    };

    const parsed = ProjectSchema.parse(project);
    expect(parsed).toEqual(project);
  });

  it("validates trust profiles", () => {
    const profiles = ["untrusted", "safe", "developer", "trusted", "custom"];
    for (const p of profiles) {
      expect(TrustProfileSchema.parse(p)).toBe(p);
    }
  });

  it("validates project statuses", () => {
    const statuses = ["active", "archived", "paused"];
    for (const s of statuses) {
      expect(ProjectStatusSchema.parse(s)).toBe(s);
    }
  });
});
