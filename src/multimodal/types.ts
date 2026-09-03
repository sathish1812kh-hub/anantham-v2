/**
 * Unified Multimodal Architecture Contracts & Types
 * PRD-MM-001 through PRD-MM-006, PRD-INV-002, PRD-PART2-302, PRD-PART2-304
 */

export type MultimodalKind = "image" | "document" | "screen" | "audio";

export type ImageFormat = "png" | "jpeg" | "webp" | "gif" | "svg" | "unknown";

export interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedBoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OcrBlock {
  id: string;
  text: string;
  confidence: number;
  box: BoundingBox;
}

export interface UiElement {
  id: string;
  type: string;
  label?: string;
  box: BoundingBox;
  clickable: boolean;
  normalizedCenter: { x: number; y: number };
}

export interface DocumentSection {
  pageNumber: number;
  heading?: string;
  text: string;
  tables?: Array<string[][]>;
}

export interface AudioTranscriptionResult {
  text: string;
  durationSeconds: number;
  language: string;
  segments: Array<{ start: number; end: number; text: string }>;
  confidence: number;
}

export interface MultimodalBudget {
  maxTokens: number;
  maxDimensionPixels: number;
  maxSizeBytes: number;
  allowedFormats: string[];
}

export interface MultimodalContextItem {
  id: string;
  kind: MultimodalKind;
  mimeType: string;
  dataUri?: string;
  referencePath?: string;
  estimatedTokens: number;
  metadata: Record<string, unknown>;
}
