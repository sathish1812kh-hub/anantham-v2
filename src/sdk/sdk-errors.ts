/**
 * Typed API Error representation for Anantham SDK clients.
 * PRD Part 2 Section 215.
 */
export class AnanthamApiError extends Error {
  public readonly statusCode: number;
  public readonly classification: string;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(options: {
    message: string;
    statusCode: number;
    classification?: string;
    code?: string;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "AnanthamApiError";
    this.statusCode = options.statusCode;
    this.classification = options.classification ?? "INTERNAL_ERROR";
    this.code = options.code ?? "error";
    this.details = options.details;
  }
}
