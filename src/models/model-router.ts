import {
  ModelCandidateSchema,
  RoutingDecisionSchema,
  RoutingExecutionResultSchema,
  RoutingRequestSchema,
  type ExecutionAttemptRecord,
  type ModelCandidate,
  type RejectedCandidate,
  type RoutingDecision,
  type RoutingExecutionResult,
  type RoutingRequest,
} from "../domain/routing.js";
import {
  ModelRequestSchema,
  type ModelRequest,
  type ModelResponse,
} from "../domain/model.js";
import type { SensitivityLevel } from "../domain/security.js";
import { CapabilityResolver } from "./capability-resolver.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import {
  ContentFilterError,
  InvalidToolCallError,
  ModelExecutionError,
  RateLimitError,
  ProviderUnavailableError,
  ModelTimeoutError,
} from "./model-errors.js";
import { KeyPoolManager } from "./key-pool-manager.js";
import { ProviderHealthTracker } from "./provider-health-tracker.js";

export class NoCompatibleModelCandidateError extends ModelExecutionError {
  public readonly rejectedCandidates: RejectedCandidate[];

  constructor(message: string, rejectedCandidates: RejectedCandidate[]) {
    super(message, { statusCode: 400 });
    this.name = "NoCompatibleModelCandidateError";
    this.rejectedCandidates = rejectedCandidates;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AllCandidatesExhaustedError extends ModelExecutionError {
  public readonly attempts: ExecutionAttemptRecord[];

  constructor(message: string, attempts: ExecutionAttemptRecord[]) {
    super(message, { statusCode: 503 });
    this.name = "AllCandidatesExhaustedError";
    this.attempts = attempts;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const SENSITIVITY_RANK: Record<SensitivityLevel, number> = {
  public: 0,
  normal: 1,
  sensitive: 2,
  secret: 3,
};

export interface ModelRouterOptions {
  keyPoolManager?: KeyPoolManager;
  healthTracker?: ProviderHealthTracker;
}

export class ModelRouter {
  private candidates: Map<string, { candidate: ModelCandidate; adapter: ProviderAdapter }> = new Map();
  public readonly keyPoolManager?: KeyPoolManager;
  public readonly healthTracker: ProviderHealthTracker;

  constructor(options: ModelRouterOptions = {}) {
    this.keyPoolManager = options.keyPoolManager;
    this.healthTracker = options.healthTracker || new ProviderHealthTracker();
  }

  public registerCandidate(candidate: ModelCandidate, adapter: ProviderAdapter): void {
    const validatedCandidate = ModelCandidateSchema.parse(candidate);
    const key = `${validatedCandidate.providerId}:${validatedCandidate.modelId}`;
    this.candidates.set(key, { candidate: validatedCandidate, adapter });
  }

  public getCandidate(modelId: string, providerId?: string): { candidate: ModelCandidate; adapter: ProviderAdapter } | undefined {
    if (providerId) {
      return this.candidates.get(`${providerId}:${modelId}`);
    }
    for (const entry of this.candidates.values()) {
      if (entry.candidate.modelId === modelId) {
        return entry;
      }
    }
    return undefined;
  }

  public listCandidates(): ModelCandidate[] {
    return Array.from(this.candidates.values()).map((e) => e.candidate);
  }

  /**
   * Deterministically evaluates registered model candidates against requirements, health, and policy.
   * PRD Part 1 Section 83 & PRD Part 2 Section 42.
   */
  public route(request: RoutingRequest): RoutingDecision {
    const validatedReq = RoutingRequestSchema.parse(request);
    const eligible: ModelCandidate[] = [];
    const rejected: RejectedCandidate[] = [];

    const reqSensitivityRank = SENSITIVITY_RANK[validatedReq.sensitivity];

    for (const { candidate, adapter } of this.candidates.values()) {
      // 1. Data Sensitivity Authorization Filter
      const candidateMaxRank = SENSITIVITY_RANK[candidate.maxSensitivity];
      if (reqSensitivityRank > candidateMaxRank) {
        rejected.push({
          modelId: candidate.modelId,
          providerId: candidate.providerId,
          reason: `Sensitivity level '${validatedReq.sensitivity}' exceeds candidate maxSensitivity '${candidate.maxSensitivity}'`,
        });
        continue;
      }

      // 2. Provider Health Filter
      const provHealth = this.healthTracker.getProviderHealth(candidate.providerId);
      if (provHealth.status === "unavailable") {
        rejected.push({
          modelId: candidate.modelId,
          providerId: candidate.providerId,
          reason: `Provider '${candidate.providerId}' is currently unavailable (Reason: ${provHealth.reason || "Outage"})`,
        });
        continue;
      }

      // 3. Capability Resolution Filter
      const resolution = CapabilityResolver.resolve(
        candidate.profile,
        validatedReq.requirements,
        {
          providerCapabilities: adapter.getCapabilities(candidate.modelId),
        }
      );

      if (!resolution.compatible) {
        rejected.push({
          modelId: candidate.modelId,
          providerId: candidate.providerId,
          reason: resolution.explanation,
        });
        continue;
      }

      eligible.push(candidate);
    }

    if (eligible.length === 0) {
      throw new NoCompatibleModelCandidateError(
        `No compatible model candidates available for requested capabilities. (${rejected.length} candidates rejected)`,
        rejected
      );
    }

    // 4. Deterministic Ranking
    eligible.sort((a, b) => {
      // Explicit model preference
      if (validatedReq.preferredModelId) {
        if (a.modelId === validatedReq.preferredModelId && b.modelId !== validatedReq.preferredModelId) return -1;
        if (b.modelId === validatedReq.preferredModelId && a.modelId !== validatedReq.preferredModelId) return 1;
      }
      // Explicit provider preference
      if (validatedReq.preferredProviderId) {
        if (a.providerId === validatedReq.preferredProviderId && b.providerId !== validatedReq.preferredProviderId) return -1;
        if (b.providerId === validatedReq.preferredProviderId && a.providerId !== validatedReq.preferredProviderId) return 1;
      }
      // Degraded health downranking
      const aHealth = this.healthTracker.getProviderHealth(a.providerId);
      const bHealth = this.healthTracker.getProviderHealth(b.providerId);
      if (aHealth.status === "healthy" && bHealth.status === "degraded") return -1;
      if (bHealth.status === "healthy" && aHealth.status === "degraded") return 1;

      // Configured priority descending
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Stable tie-break: providerId, then modelId
      const provCmp = a.providerId.localeCompare(b.providerId);
      if (provCmp !== 0) return provCmp;
      return a.modelId.localeCompare(b.modelId);
    });

    const selected = eligible[0];
    if (!selected) {
      throw new NoCompatibleModelCandidateError(
        `No compatible model candidates available for requested capabilities.`,
        rejected
      );
    }
    const explanation = `Selected '${selected.providerId}:${selected.modelId}' (Priority: ${selected.priority}). ${eligible.length - 1} fallback candidate(s) available.`;

    return Object.freeze(
      RoutingDecisionSchema.parse({
        selectedCandidate: selected,
        rankedCandidates: eligible,
        rejectedCandidates: rejected,
        explanation,
      })
    );
  }

  /**
   * Executes a model request through deterministic routing, key leasing, and bounded failover cascades.
   */
  public async execute(
    modelRequest: ModelRequest,
    routingRequest: RoutingRequest
  ): Promise<RoutingExecutionResult> {
    const validatedModelReq = ModelRequestSchema.parse(modelRequest);
    const decision = this.route(routingRequest);

    const attempts: ExecutionAttemptRecord[] = [];
    const maxAttempts = Math.min(routingRequest.maxAttempts, decision.rankedCandidates.length);

    let lastError: Error | undefined;

    for (let i = 0; i < maxAttempts; i++) {
      const candidate = decision.rankedCandidates[i];
      if (!candidate) {
        continue;
      }
      const entry = this.getCandidate(candidate.modelId, candidate.providerId);

      if (!entry) {
        continue;
      }

      const attemptNumber = i + 1;
      const startTime = Date.now();

      // Key lease acquisition if keyPoolManager is configured
      let leaseId: string | undefined;
      if (this.keyPoolManager) {
        const keyResult = await this.keyPoolManager.acquireKey(candidate.providerId);
        if (!keyResult.success) {
          // Key pool exhausted for this candidate -> record attempt failure and cascade to next candidate
          const durationMs = Date.now() - startTime;
          attempts.push({
            attemptNumber,
            modelId: candidate.modelId,
            providerId: candidate.providerId,
            status: "failure",
            errorName: "KeyPoolExhaustedError",
            errorMessage: keyResult.rejectionReason || "No eligible keys in pool",
            durationMs,
            timestamp: new Date().toISOString(),
          });
          continue;
        }
        leaseId = keyResult.lease?.leaseId;
      }

      try {
        const response: ModelResponse = await entry.adapter.send({
          ...validatedModelReq,
          modelId: candidate.modelId,
        });

        const durationMs = Date.now() - startTime;

        if (leaseId && this.keyPoolManager) {
          this.keyPoolManager.releaseKey(leaseId, { isError: false });
        }

        this.healthTracker.recordSuccess(candidate.providerId, candidate.modelId);

        attempts.push({
          attemptNumber,
          modelId: candidate.modelId,
          providerId: candidate.providerId,
          status: "success",
          durationMs,
          timestamp: new Date().toISOString(),
        });

        return Object.freeze(
          RoutingExecutionResultSchema.parse({
            response,
            decision,
            attempts,
            succeededCandidate: candidate,
          })
        );
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const errorName = err?.name || "ModelExecutionError";
        const errorMessage = err?.message || String(err);

        if (leaseId && this.keyPoolManager) {
          const isRateLimit = err instanceof RateLimitError;
          this.keyPoolManager.releaseKey(leaseId, {
            isError: true,
            cooldownMs: isRateLimit ? 5000 : 0,
          });
        }

        this.healthTracker.recordFailure(candidate.providerId, candidate.modelId, err);

        attempts.push({
          attemptNumber,
          modelId: candidate.modelId,
          providerId: candidate.providerId,
          status: "failure",
          errorName,
          errorMessage,
          durationMs,
          timestamp: new Date().toISOString(),
        });

        lastError = err;

        // Non-retryable / permanent errors abort immediately
        if (
          err instanceof ContentFilterError ||
          err instanceof InvalidToolCallError
        ) {
          throw err;
        }

        // Only retry on transient/recoverable errors
        const isTransient =
          err instanceof RateLimitError ||
          err instanceof ProviderUnavailableError ||
          err instanceof ModelTimeoutError;

        if (!isTransient && i === maxAttempts - 1) {
          throw err;
        }
      }
    }

    throw new AllCandidatesExhaustedError(
      `All ${maxAttempts} model candidate attempt(s) failed. Last error: ${lastError?.message || "Unknown"}`,
      attempts
    );
  }
}
