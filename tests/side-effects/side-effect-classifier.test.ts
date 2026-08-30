import { describe, it, expect } from "vitest";
import { SideEffectClassifier } from "../../src/side-effects/side-effect-classifier.js";

describe("P4.5 Side Effect Classifier — Operation Categorization", () => {
  const classifier = new SideEffectClassifier();

  it("classifies read-only operations accurately", () => {
    expect(classifier.classify("read_file")).toBe("read_only");
    expect(classifier.classify("search_text")).toBe("read_only");
    expect(classifier.classify("find_files")).toBe("read_only");
    expect(classifier.classify("git_status")).toBe("read_only");
    expect(classifier.classify("git_diff")).toBe("read_only");
    expect(classifier.classify("retrieve_memory")).toBe("read_only");
    expect(classifier.classify("fetch_url", { method: "GET" })).toBe("read_only");
  });

  it("classifies idempotent writes accurately", () => {
    expect(classifier.classify("write_file")).toBe("idempotent_write");
    expect(classifier.classify("save_artifact")).toBe("idempotent_write");
    expect(classifier.classify("store_memory")).toBe("idempotent_write");
    expect(classifier.classify("fetch_url", { method: "PUT" })).toBe("idempotent_write");
  });

  it("classifies reversible writes accurately", () => {
    expect(classifier.classify("worktree_add")).toBe("reversible_write");
  });

  it("classifies non-idempotent operations accurately", () => {
    expect(classifier.classify("git_commit")).toBe("non_idempotent_write");
    expect(classifier.classify("run_command")).toBe("non_idempotent_write");
    expect(classifier.classify("fetch_url", { method: "POST" })).toBe("non_idempotent_write");
  });

  it("defaults unclassified or ambiguous tools to unknown", () => {
    expect(classifier.classify("custom_unknown_tool")).toBe("unknown");
    expect(classifier.isSafeToRetry("unknown")).toBe(false);
    expect(classifier.isSafeToRetry("non_idempotent_write")).toBe(false);
    expect(classifier.isSafeToRetry("read_only")).toBe(true);
    expect(classifier.isSafeToRetry("idempotent_write")).toBe(true);
  });
});
