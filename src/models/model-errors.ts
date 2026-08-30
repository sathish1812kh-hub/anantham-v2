export class ModelExecutionError extends Error {
  public readonly providerId?: string;
  public readonly modelId?: string;
  public readonly statusCode?: number;

  constructor(message: string, options?: { providerId?: string; modelId?: string; statusCode?: number }) {
    super(message);
    this.name = "ModelExecutionError";
    this.providerId = options?.providerId;
    this.modelId = options?.modelId;
    this.statusCode = options?.statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RateLimitError extends ModelExecutionError {
  public readonly retryAfterMs?: number;

  constructor(message: string, options?: { providerId?: string; modelId?: string; retryAfterMs?: number }) {
    super(message, { ...options, statusCode: 429 });
    this.name = "RateLimitError";
    this.retryAfterMs = options?.retryAfterMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ContextWindowExceededError extends ModelExecutionError {
  public readonly tokenCount?: number;
  public readonly maxContextTokens?: number;

  constructor(
    message: string,
    options?: { providerId?: string; modelId?: string; tokenCount?: number; maxContextTokens?: number }
  ) {
    super(message, { ...options, statusCode: 400 });
    this.name = "ContextWindowExceededError";
    this.tokenCount = options?.tokenCount;
    this.maxContextTokens = options?.maxContextTokens;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends ModelExecutionError {
  constructor(message: string, options?: { providerId?: string; modelId?: string }) {
    super(message, { ...options, statusCode: 401 });
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProviderUnavailableError extends ModelExecutionError {
  constructor(message: string, options?: { providerId?: string; modelId?: string }) {
    super(message, { ...options, statusCode: 503 });
    this.name = "ProviderUnavailableError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ModelTimeoutError extends ModelExecutionError {
  public readonly timeoutMs?: number;

  constructor(message: string, options?: { providerId?: string; modelId?: string; timeoutMs?: number }) {
    super(message, { ...options, statusCode: 408 });
    this.name = "ModelTimeoutError";
    this.timeoutMs = options?.timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ContentFilterError extends ModelExecutionError {
  constructor(message: string, options?: { providerId?: string; modelId?: string }) {
    super(message, { ...options, statusCode: 400 });
    this.name = "ContentFilterError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidToolCallError extends ModelExecutionError {
  public readonly toolName?: string;
  public readonly rawArguments?: string;

  constructor(
    message: string,
    options?: { providerId?: string; modelId?: string; toolName?: string; rawArguments?: string }
  ) {
    super(message, { ...options, statusCode: 422 });
    this.name = "InvalidToolCallError";
    this.toolName = options?.toolName;
    this.rawArguments = options?.rawArguments;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
