/**
 * Screen & UI Understanding Engine
 * PRD-MM-004: Screen & UI Understanding
 */

import type { UiElement, BoundingBox, NormalizedBoundingBox } from "./types.js";

export class ScreenUnderstandingEngine {
  public normalizeCoordinates(box: BoundingBox, screenWidth: number, screenHeight: number): NormalizedBoundingBox {
    return {
      left: Math.max(0, Math.min(1, box.x / screenWidth)),
      top: Math.max(0, Math.min(1, box.y / screenHeight)),
      right: Math.max(0, Math.min(1, (box.x + box.width) / screenWidth)),
      bottom: Math.max(0, Math.min(1, (box.y + box.height) / screenHeight)),
    };
  }

  public denormalizePoint(
    normalized: { x: number; y: number },
    screenWidth: number,
    screenHeight: number
  ): { x: number; y: number } {
    return {
      x: Math.round(normalized.x * screenWidth),
      y: Math.round(normalized.y * screenHeight),
    };
  }

  public findElementAtPoint(elements: UiElement[], x: number, y: number): UiElement | null {
    // Find top-most / smallest clickable element containing (x, y)
    let matched: UiElement | null = null;
    let minArea = Infinity;

    for (const el of elements) {
      if (
        x >= el.box.x &&
        x <= el.box.x + el.box.width &&
        y >= el.box.y &&
        y <= el.box.y + el.box.height
      ) {
        const area = el.box.width * el.box.height;
        if (area < minArea) {
          minArea = area;
          matched = el;
        }
      }
    }

    return matched;
  }

  public generateAccessibilitySummary(elements: UiElement[]): string {
    const lines: string[] = ["# UI Accessibility & Interactive Tree"];

    for (const el of elements) {
      const labelStr = el.label ? ` "${el.label}"` : "";
      const clickStr = el.clickable ? " [Clickable]" : "";
      lines.push(
        `- ${el.type}${labelStr}${clickStr} at (${el.box.x}, ${el.box.y}) size ${el.box.width}x${el.box.height}`
      );
    }

    return lines.join("\n");
  }
}
