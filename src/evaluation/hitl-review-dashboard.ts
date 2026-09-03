/**
 * Human-in-the-Loop Review Dashboard & Annotation UI Subsystem
 * PRD-PART2-311: Human-in-the-Loop Review Dashboard & Annotation UI
 */

export interface ReviewItem {
  id: string;
  sessionId: string;
  agentId: string;
  prompt: string;
  output: string;
  status: "pending" | "approved" | "rejected" | "amended";
  humanRating?: number; // 1 to 5
  annotation?: string;
  flags?: Array<"hallucination" | "safety_violation" | "incomplete" | "syntax_error">;
  reviewedBy?: string;
  reviewedAt?: string;
}

export class HitlReviewDashboard {
  private queue: Map<string, ReviewItem> = new Map();

  public submitForReview(sessionId: string, agentId: string, prompt: string, output: string): ReviewItem {
    const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const item: ReviewItem = {
      id,
      sessionId,
      agentId,
      prompt,
      output,
      status: "pending",
    };
    this.queue.set(id, item);
    return item;
  }

  public annotate(
    reviewId: string,
    reviewerId: string,
    status: "approved" | "rejected" | "amended",
    rating: number,
    annotation?: string,
    flags?: ReviewItem["flags"]
  ): ReviewItem {
    const item = this.queue.get(reviewId);
    if (!item) {
      throw new Error(`Review item '${reviewId}' not found`);
    }

    item.status = status;
    item.humanRating = Math.max(1, Math.min(5, rating));
    item.reviewedBy = reviewerId;
    item.reviewedAt = new Date().toISOString();
    item.annotation = annotation;
    item.flags = flags ?? [];

    return item;
  }

  public getPendingReviews(): ReviewItem[] {
    return Array.from(this.queue.values()).filter((i) => i.status === "pending");
  }

  public getCompletedReviews(): ReviewItem[] {
    return Array.from(this.queue.values()).filter((i) => i.status !== "pending");
  }
}
