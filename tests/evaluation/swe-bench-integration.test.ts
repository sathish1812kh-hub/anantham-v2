import { describe, it, expect } from "vitest";
import { SweBenchHarness, type SweBenchInstance } from "../../src/evaluation/swe-bench-harness.js";

describe("PRD-EVAL-002: SWE-bench Integration & Evaluation Harness", () => {
  const harness = new SweBenchHarness();

  const mockInstance: SweBenchInstance = {
    instanceId: "django__django-11099",
    repo: "django/django",
    baseCommit: "d8c0b8f",
    problemStatement: "Fix UsernameValidator regex escaping",
    failToPassTests: ["tests.auth_tests.test_validators.TestUsernameValidator"],
    passToPassTests: ["tests.auth_tests.test_models.TestUserModel"],
  };

  it("evaluates well-formed patch passing both FAIL_TO_PASS and PASS_TO_PASS suites", () => {
    const validPatch = `
diff --git a/django/contrib/auth/validators.py b/django/contrib/auth/validators.py
--- a/django/contrib/auth/validators.py
+++ b/django/contrib/auth/validators.py
@@ -17,3 +17,3 @@
`;

    const res = harness.evaluatePatch(mockInstance, validPatch, (_testName) => true);
    expect(res.resolved).toBe(true);
    expect(res.appliedPatch).toBe(true);
    expect(res.failToPassPassed).toBe(true);
    expect(res.passToPassPassed).toBe(true);
  });

  it("rejects empty patches and identifies regressions in PASS_TO_PASS suites", () => {
    // 1. Empty patch
    const emptyRes = harness.evaluatePatch(mockInstance, "");
    expect(emptyRes.resolved).toBe(false);
    expect(emptyRes.appliedPatch).toBe(false);

    // 2. Patch that causes regression
    const regressingPatch = "diff --git a/file.py b/file.py\n--- a\n+++ b";
    const regRes = harness.evaluatePatch(mockInstance, regressingPatch, (testName) => {
      // PASS_TO_PASS regression
      return !testName.includes("test_models");
    });

    expect(regRes.resolved).toBe(false);
    expect(regRes.passToPassPassed).toBe(false);
    expect(regRes.failingTests).toContain("tests.auth_tests.test_models.TestUserModel");
  });
});
