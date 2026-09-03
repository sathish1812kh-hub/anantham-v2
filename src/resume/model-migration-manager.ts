import { randomBytes } from "node:crypto";
import { z } from "zod";
import { SessionRepository } from "../persistence/repositories/session-repository.js";
import { EventStore } from "../event-state/event-store.js";
import { ModelRouter, NoCompatibleModelCandidateError } from "../models/model-router.js";
import { ProviderHealthTracker } from "../models/provider-health-tracker.js";
import { KeyPoolManager } from "../models/key-pool-manager.js";
import type { Session } from "../domain/session.js";

export const MigrationReasonSchema = z.enum([
  "USER_OVERRIDE",
  "PROVIDER_UNAVAILABLE",
  "MODEL_DEPRECATED",
  "MODEL_RETIRED",
  "KEY_EXHAUSTED",
  "CONTEXT_WINDOW_EXCEEDED",
  "CAPABILITY_UPGRADE",
]);
export type MigrationReason = z.infer<typeof MigrationReasonSchema>;

export const ModelMigrationEvaluationSchema = z.object({
  canMigrate: z.boolean(),
  currentModelProfile: z.string(),
  currentProviderId: z.string().optional(),
  targetModelProfile: z.string(),
  targetProviderId: z.string().optional(),
  reason: MigrationReasonSchema,
  missingCapabilities: z.array(z.string()),
  contextWindowDelta: z.object({
    currentContextWindow: z.number().int().nonnegative(),
    targetContextWindow: z.number().int().nonnegative(),
    requiresCompaction: z.boolean(),
    estimatedPromptTokens: z.number().int().nonnegative(),
  }),
  modalityDelta: z.object({
    lostModalities: z.array(z.string()),
    requiresFallbackRepresentation: z.boolean(),
  }),
  explanation: z.string(),
});
export type ModelMigrationEvaluation = z.infer<typeof ModelMigrationEvaluationSchema>;

export const ModelMigrationResultSchema = z.object({
  success: z.boolean(),
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  previousModelProfile: z.string().min(1),
  newModelProfile: z.string().min(1),
  previousProviderId: z.string().optional(),
  newProviderId: z.string().optional(),
  reason: MigrationReasonSchema,
  compactionTriggered: z.boolean(),
  modalityFallbackApplied: z.boolean(),
  migratedAt: z.string().min(1),
  eventId: z.string().min(1),
  message: z.string(),
});
export type ModelMigrationResult = z.infer<typeof ModelMigrationResultSchema>;

export interface ModelMigrationManagerOptions {
  sessionRepo: SessionRepository;
  eventStore: EventStore;
  modelRouter: ModelRouter;
  providerHealthTracker?: ProviderHealthTracker;
  keyPoolManager?: KeyPoolManager;
}

export class ModelMigrationManager {
  private readonly sessionRepo: SessionRepository;
  private readonly eventStore: EventStore;
  private readonly modelRouter: ModelRouter;
  private readonly providerHealthTracker?: ProviderHealthTracker;
  
  constructor(options: ModelMigrationManagerOptions) {
    this.sessionRepo = options.sessionRepo;
    this.eventStore = options.eventStore;
    this.modelRouter = options.modelRouter;
    this.providerHealthTracker = options.providerHealthTracker ?? options.modelRouter.healthTracker;
      }

  public evaluateMigration(
    session: Session,
    targetModelProfile: string,
    reason: MigrationReason,
    currentPromptTokens: number = 0
  ): ModelMigrationEvaluation {
    const currentEntry = this.modelRouter.getCandidate(session.modelProfile);
    const targetEntry = this.modelRouter.getCandidate(targetModelProfile);

    const currentContext = currentEntry?.candidate.profile.limits.contextWindow ?? 128_000;
    const targetContext = targetEntry?.candidate.profile.limits.contextWindow ?? 128_000;

    const requiresCompaction = targetContext < currentPromptTokens || (targetContext < currentContext && currentPromptTokens > targetContext * 0.8);

    const lostModalities: string[] = [];
    if (currentEntry?.candidate.profile.inputs.imageInput && !targetEntry?.candidate.profile.inputs.imageInput) {
      lostModalities.push("vision");
    }

    const missingCapabilities: string[] = [];
    if (currentEntry?.candidate.profile.features.toolCalling && !targetEntry?.candidate.profile.features.toolCalling) {
      missingCapabilities.push("toolCalling");
    }
    if (currentEntry?.candidate.profile.features.structuredOutput && !targetEntry?.candidate.profile.features.structuredOutput) {
      missingCapabilities.push("structuredOutput");
    }

    const canMigrate = Boolean(targetEntry) && missingCapabilities.length === 0;

    return {
      canMigrate,
      currentModelProfile: session.modelProfile,
      currentProviderId: currentEntry?.candidate.providerId,
      targetModelProfile,
      targetProviderId: targetEntry?.candidate.providerId,
      reason,
      missingCapabilities,
      contextWindowDelta: {
        currentContextWindow: currentContext,
        targetContextWindow: targetContext,
        requiresCompaction,
        estimatedPromptTokens: currentPromptTokens,
      },
      modalityDelta: {
        lostModalities,
        requiresFallbackRepresentation: lostModalities.length > 0,
      },
      explanation: canMigrate
        ? ("Eligible for migration from " + session.modelProfile + " to " + targetModelProfile + ".")
        : ("Ineligible: Target " + targetModelProfile + " missing required capabilities [" + missingCapabilities.join(", ") + "]."),
    };
  }

  public async resolveAndMigrateOnResume(
    session: Session,
    options?: {
      overrideModelProfile?: string;
      estimatedTokens?: number;
      dryRun?: boolean;
    }
  ): Promise<{
    migrated: boolean;
    activeModelProfile: string;
    migrationResult?: ModelMigrationResult;
  }> {
    // 1. Explicit user override
    if (options?.overrideModelProfile && options.overrideModelProfile !== session.modelProfile) {
      const evalResult = this.evaluateMigration(session, options.overrideModelProfile, "USER_OVERRIDE", options.estimatedTokens);
      if (!evalResult.canMigrate) {
        throw new NoCompatibleModelCandidateError(
          "User requested override model " + options.overrideModelProfile + " is incompatible: " + evalResult.missingCapabilities.join(", "),
          []
        );
      }
      const migrationResult = await this.executeMigration(session, options.overrideModelProfile, "USER_OVERRIDE", options);
      return { migrated: true, activeModelProfile: options.overrideModelProfile, migrationResult };
    }

    // 2. Check current model health and retirement
    const currentEntry = this.modelRouter.getCandidate(session.modelProfile);
    let migrationReason: MigrationReason | null = null;

    if (!currentEntry) {
      migrationReason = "MODEL_DEPRECATED";
    } else {
      if (currentEntry.candidate.profile.status === "invalid") {
        migrationReason = "MODEL_DEPRECATED";
      } else if (currentEntry.candidate.profile.status === "stale") {
        migrationReason = "MODEL_RETIRED";
      } else if (this.providerHealthTracker) {
        const health = this.providerHealthTracker.getProviderHealth(currentEntry.candidate.providerId);
        if (health.status === "unavailable" || health.status === "degraded") {
          migrationReason = "PROVIDER_UNAVAILABLE";
        }
      }
    }

    // 3. If migration is required, route to substitute
    if (migrationReason) {
      const decision = this.modelRouter.route({
        sensitivity: "normal",
        requirements: {
          requiredFeatures: [
            ...(currentEntry?.candidate.profile.features.toolCalling ? ["toolCalling" as const] : []),
            ...(currentEntry?.candidate.profile.features.structuredOutput ? ["structuredOutput" as const] : []),
          ],
        },
        maxAttempts: 3,
      });

      const targetModel = decision.selectedCandidate.modelId;
      const evalResult = this.evaluateMigration(session, targetModel, migrationReason, options?.estimatedTokens);
      if (!evalResult.canMigrate) {
        throw new NoCompatibleModelCandidateError(
          "No compatible model substitute found for deprecated " + session.modelProfile + ".",
          []
        );
      }

      const migrationResult = await this.executeMigration(session, targetModel, migrationReason, options);
      return { migrated: true, activeModelProfile: targetModel, migrationResult };
    }

    return {
      migrated: false,
      activeModelProfile: session.modelProfile,
    };
  }

  public async executeMigration(
    session: Session,
    targetModelProfile: string,
    reason: MigrationReason,
    options?: { dryRun?: boolean; estimatedTokens?: number }
  ): Promise<ModelMigrationResult> {
    const evalResult = this.evaluateMigration(session, targetModelProfile, reason, options?.estimatedTokens);
    const now = new Date().toISOString();
    const eventId = "evt_mig_" + Date.now() + "_" + randomBytes(3).toString("hex");

    if (!options?.dryRun) {
      // 1. Update session modelProfile in persistence
      const updatedSession: Session = {
        ...session,
        modelProfile: targetModelProfile,
        updatedAt: now,
      };
      this.sessionRepo.save(updatedSession);

      // 2. Emit model.migrated event
      this.eventStore.append({
        id: eventId,
        schemaVersion: 1,
        projectId: session.projectId,
        sessionId: session.id,
        type: "model.migrated",
        actor: "system",
        timestamp: now,
        payload: {
          previousModelProfile: session.modelProfile,
          newModelProfile: targetModelProfile,
          reason,
          compactionTriggered: evalResult.contextWindowDelta.requiresCompaction,
          modalityFallbackApplied: evalResult.modalityDelta.requiresFallbackRepresentation,
          contextWindowDelta: evalResult.contextWindowDelta,
        },
      });
    }

    return {
      success: true,
      sessionId: session.id,
      projectId: session.projectId,
      previousModelProfile: session.modelProfile,
      newModelProfile: targetModelProfile,
      previousProviderId: evalResult.currentProviderId,
      newProviderId: evalResult.targetProviderId,
      reason,
      compactionTriggered: evalResult.contextWindowDelta.requiresCompaction,
      modalityFallbackApplied: evalResult.modalityDelta.requiresFallbackRepresentation,
      migratedAt: now,
      eventId,
      message: "Successfully migrated session " + session.name + " from " + session.modelProfile + " to " + targetModelProfile + " (Reason: " + reason + ").",
    };
  }
}
