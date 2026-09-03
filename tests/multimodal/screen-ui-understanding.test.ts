import { describe, it, expect } from "vitest";
import { ScreenUnderstandingEngine } from "../../src/multimodal/screen-understanding.js";
import type { UiElement } from "../../src/multimodal/types.js";

describe("PRD-MM-004: Screen & UI Understanding", () => {
  const engine = new ScreenUnderstandingEngine();

  const elements: UiElement[] = [
    {
      id: "btn_submit",
      type: "button",
      label: "Submit Order",
      box: { x: 100, y: 200, width: 120, height: 40 },
      clickable: true,
      normalizedCenter: { x: 0.16, y: 0.22 },
    },
    {
      id: "input_username",
      type: "text_field",
      label: "Username",
      box: { x: 100, y: 100, width: 200, height: 30 },
      clickable: true,
      normalizedCenter: { x: 0.2, y: 0.115 },
    },
  ];

  it("normalizes coordinates between 0.0 and 1.0", () => {
    const norm = engine.normalizeCoordinates({ x: 960, y: 540, width: 100, height: 50 }, 1920, 1080);
    expect(norm.left).toBeCloseTo(0.5);
    expect(norm.top).toBeCloseTo(0.5);
  });

  it("identifies interactive UI elements by click point", () => {
    const hit = engine.findElementAtPoint(elements, 150, 220);
    expect(hit?.id).toBe("btn_submit");
    expect(hit?.label).toBe("Submit Order");
  });

  it("generates textual accessibility and UI tree summary", () => {
    const summary = engine.generateAccessibilitySummary(elements);
    expect(summary).toContain("button \"Submit Order\" [Clickable]");
    expect(summary).toContain("text_field \"Username\" [Clickable]");
  });
});
