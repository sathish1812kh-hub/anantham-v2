import { describe, it, expect } from "vitest";
import { HitlReviewDashboard } from "../../src/evaluation/hitl-review-dashboard.js";

describe("PRD-PART2-311: Human-in-the-Loop Review Dashboard & Annotation UI", () => {
  const dashboard = new HitlReviewDashboard();

  it("submits items for human review, tracks queue status, and records annotations", () => {
    const item = dashboard.submitForReview(
      "sess_m5",
      "agent_sql",
      "Write a migration for sqlite WAL mode",
      "PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;"
    );

    expect(item.id).toBeDefined();
    expect(item.status).toBe("pending");
    expect(dashboard.getPendingReviews().length).toBe(1);

    // Annotate and approve
    const reviewed = dashboard.annotate(
      item.id,
      "human_senior_eng",
      "approved",
      5,
      "Matches RPO-0 durability requirements exactly",
      []
    );

    expect(reviewed.status).toBe("approved");
    expect(reviewed.humanRating).toBe(5);
    expect(reviewed.reviewedBy).toBe("human_senior_eng");
    expect(dashboard.getPendingReviews().length).toBe(0);
    expect(dashboard.getCompletedReviews().length).toBe(1);
  });
});
