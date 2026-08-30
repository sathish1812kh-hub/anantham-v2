import {
  type ToolInvocationRequest,
  type ToolObservation,
  ToolInvocationRequestSchema,
  ToolObservationSchema,
} from "../domain/tool.js";
import { type ToolRegistry } from "./tool-registry.js";
import { type IdempotencyStore } from "./idempotency-store.js";
import { type PolicyEngine } from "../policy/policy-engine.js";
import { type ApprovalManager } from "../policy/approval-manager.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes } from "../domain/event.js";
import { type SideEffectJournal } from "../side-effects/side-effect-journal.js";
import { type SideEffectClassifier } from "../side-effects/side-effect-classifier.js";
import { type FileDivergenceDetector } from "../side-effects/file-divergence-detector.js";

export interface ToolGatewayOptions {
  registry: ToolRegistry;
  policyEngine?: PolicyEngine;
  approvalManager?: ApprovalManager;
  eventStore?: EventStore;
  idempotencyStore?: IdempotencyStore;
  sideEffectJournal?: SideEffectJournal;
  sideEffectClassifier?: SideEffectClassifier;
  fileDivergenceDetector?: FileDivergenceDetector;
  defaultTimeoutMs?: number;
}

export class ToolGateway {
  private readonly registry: ToolRegistry;
  private readonly policyEngine?: PolicyEngine;
  private readonly approvalManager?: ApprovalManager;
  private readonly eventStore?: EventStore;
  private readonly idempotencyStore?: IdempotencyStore;
  private readonly sideEffectJournal?: SideEffectJournal;
  private readonly sideEffectClassifier?: SideEffectClassifier;
  private readonly fileDivergenceDetector?: FileDivergenceDetector;
  private readonly defaultTimeoutMs: number;

  constructor(options: ToolGatewayOptions) {
    this.registry = options.registry;
    this.policyEngine = options.policyEngine;
    this.approvalManager = options.approvalManager;
    this.eventStore = options.eventStore;
    this.idempotencyStore = options.idempotencyStore;
    this.sideEffectJournal = options.sideEffectJournal;
    this.sideEffectClassifier = options.sideEffectClassifier;
    this.fileDivergenceDetector = options.fileDivergenceDetector;
    this.defaultTimeoutMs = options.defaultTimeoutMs || 30000;
  }

  /**
   * Validates arguments against schema with prototype pollution defense.
   */
  public static validateArguments(
    args: Record<string, unknown>,
    schema: Record<string, unknown>
  ): { valid: boolean; error?: string } {
    if (typeof args !== "object" || args === null) {
      return { valid: false, error: "Arguments must be a valid non-null object." };
    }

    // Prototype pollution defense (inspect own properties)
    if (
      Object.prototype.hasOwnProperty.call(args, "__proto__") ||
      Object.prototype.hasOwnProperty.call(args, "prototype") ||
      Object.prototype.hasOwnProperty.call(args, "constructor")
    ) {
      return { valid: false, error: "Security violation: Prototype pollution payload detected in tool arguments." };
    }

    // JSON schema required fields check
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const reqField of required) {
      if (!(reqField in args) || args[reqField] === undefined) {
        return { valid: false, error: `Missing required argument: "${reqField}".` };
      }
    }

    // JSON schema property types check
    const properties = (schema.properties as Record<string, any>) || {};
    for (const [propName, propDef] of Object.entries(properties)) {
      if (propName in args && args[propName] !== undefined && propDef?.type) {
        const val = args[propName];
        const expectedType = propDef.type;

        if (expectedType === "string" && typeof val !== "string") {
          return { valid: false, error: `Argument "${propName}" must be a string, received ${typeof val}.` };
        }
        if (expectedType === "number" && typeof val !== "number") {
          return { valid: false, error: `Argument "${propName}" must be a number, received ${typeof val}.` };
        }
        if (expectedType === "boolean" && typeof val !== "boolean") {
          return { valid: false, error: `Argument "${propName}" must be a boolean, received ${typeof val}.` };
        }
        if (expectedType === "array" && !Array.isArray(val)) {
          return { valid: false, error: `Argument "${propName}" must be an array.` };
        }
        if (expectedType === "object" && (typeof val !== "object" || val === null || Array.isArray(val))) {
          return { valid: false, error: `Argument "${propName}" must be a plain object.` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Authoritative execution pipeline for all tool calls.
   * PRD Part 1 Section 83-90 & PRD Part 2 Section 41-48.
   */
  public async invoke(request: ToolInvocationRequest): Promise<ToolObservation> {
    const startTime = Date.now();
    const executedAt = new Date().toISOString();

    // 1. Invocation Request Schema Validation
    const parsedReq = ToolInvocationRequestSchema.safeParse(request);
    if (!parsedReq.success) {
      return ToolObservationSchema.parse({
        callId: request?.callId || `err_${Date.now()}`,
        toolName: request?.toolName || "unknown",
        status: "failure",
        error: {
          code: "INVALID_REQUEST",
          message: `Malformed tool invocation request: ${parsedReq.error.message}`,
          retryable: false,
        },
        durationMs: Date.now() - startTime,
        executedAt,
      });
    }

    const req = parsedReq.data;

    // 2. Tool Lookup
    const registration = this.registry.get(req.toolName);
    if (!registration) {
      return ToolObservationSchema.parse({
        callId: req.callId,
        toolName: req.toolName,
        status: "failure",
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool "${req.toolName}" is not registered in the ToolRegistry.`,
          retryable: false,
        },
        durationMs: Date.now() - startTime,
        executedAt,
      });
    }

    const { definition, handler } = registration;

    // 3. Tool Input Schema Validation
    const validation = ToolGateway.validateArguments(req.arguments, definition.parametersSchema);
    if (!validation.valid) {
      if (this.eventStore) {
        this.eventStore.append({
          id: `evt_tool_val_fail_${req.callId}`,
          schemaVersion: 1,
          projectId: req.project.id,
          sessionId: req.session?.id,
          taskId: req.task?.id,
          type: EventTypes.TOOL_FAILED,
          actor: req.actor.type,
          timestamp: executedAt,
          payload: {
            toolName: req.toolName,
            error: validation.error,
          },
        });
      }

      return ToolObservationSchema.parse({
        callId: req.callId,
        toolName: req.toolName,
        status: "failure",
        error: {
          code: "SCHEMA_VALIDATION_ERROR",
          message: validation.error || "Argument validation failed.",
          retryable: false,
        },
        durationMs: Date.now() - startTime,
        executedAt,
      });
    }

    // 4. Idempotency Check
    let hasLock = false;
    if (definition.isIdempotent && req.idempotencyKey && this.idempotencyStore) {
      const cached = this.idempotencyStore.get(req.project.id, req.toolName, req.idempotencyKey);
      if (cached) {
        return ToolObservationSchema.parse({
          ...cached,
          callId: req.callId,
          fromCache: true,
        });
      }

      hasLock = this.idempotencyStore.acquireLock(req.project.id, req.toolName, req.idempotencyKey);
      if (!hasLock) {
        return ToolObservationSchema.parse({
          callId: req.callId,
          toolName: req.toolName,
          status: "failure",
          error: {
            code: "CONCURRENT_IDEMPOTENT_EXECUTION",
            message: `Concurrent identical execution in flight for idempotency key "${req.idempotencyKey}".`,
            retryable: true,
          },
          durationMs: Date.now() - startTime,
          executedAt,
        });
      }
    }

    // Helper to release lock safely
    const releaseLockIfHeld = () => {
      if (hasLock && definition.isIdempotent && req.idempotencyKey && this.idempotencyStore) {
        this.idempotencyStore.releaseLock(req.project.id, req.toolName, req.idempotencyKey);
        hasLock = false;
      }
    };

    // 5. Policy & Approval Evaluation
    if (this.policyEngine) {
      const policyContext = {
        actor: req.actor,
        project: req.project,
        session: req.session,
        task: req.task,
        operation: {
          type: "tool_execution",
          toolName: req.toolName,
          arguments: req.arguments,
        },
        dataSensitivity: definition.sensitivity,
        requestedRiskLevel: definition.riskLevel,
      };

      const decision = this.policyEngine.evaluate(policyContext);

      if (decision.decision === "deny") {
        releaseLockIfHeld();
        if (this.eventStore) {
          this.eventStore.append({
            id: `evt_tool_deny_${req.callId}`,
            schemaVersion: 1,
            projectId: req.project.id,
            sessionId: req.session?.id,
            taskId: req.task?.id,
            type: EventTypes.TOOL_DENIED,
            actor: req.actor.type,
            timestamp: executedAt,
            payload: {
              toolName: req.toolName,
              reason: decision.reason,
              riskLevel: decision.riskLevel,
            },
          });
        }

        return ToolObservationSchema.parse({
          callId: req.callId,
          toolName: req.toolName,
          status: "denied",
          error: {
            code: "POLICY_DENIED",
            message: decision.reason,
            retryable: false,
          },
          durationMs: Date.now() - startTime,
          executedAt,
        });
      }

      if (decision.decision === "require_approval") {
        if (!req.approvalId && this.approvalManager) {
          const approvalRecord = this.approvalManager.createApprovalRequest(
            policyContext,
            decision.riskLevel
          );

          releaseLockIfHeld();
          return ToolObservationSchema.parse({
            callId: req.callId,
            toolName: req.toolName,
            status: "approval_required",
            approvalId: approvalRecord.approvalId,
            error: {
              code: "APPROVAL_REQUIRED",
              message: `Operation requires human approval [Approval ID: ${approvalRecord.approvalId}]. Reason: ${decision.reason}`,
              retryable: true,
            },
            durationMs: Date.now() - startTime,
            executedAt,
          });
        }

        if (req.approvalId && this.approvalManager) {
          const reval = this.approvalManager.validateAndConsumeApproval(
            req.approvalId,
            policyContext,
            decision.policyVersion
          );

          if (!reval.valid) {
            releaseLockIfHeld();
            return ToolObservationSchema.parse({
              callId: req.callId,
              toolName: req.toolName,
              status: "denied",
              approvalId: req.approvalId,
              error: {
                code: "APPROVAL_INVALID",
                message: `Approval validation failed: ${reval.reason}`,
                retryable: false,
              },
              durationMs: Date.now() - startTime,
              executedAt,
            });
          }
        }
      }
    }

    // 6. File Divergence Verification
    if (this.fileDivergenceDetector && typeof req.arguments.baseHash === "string" && typeof req.arguments.path === "string") {
      try {
        this.fileDivergenceDetector.assertNoDivergence(req.arguments.path, req.arguments.baseHash);
      } catch (divErr: any) {
        releaseLockIfHeld();
        return ToolObservationSchema.parse({
          callId: req.callId,
          toolName: req.toolName,
          status: "failure",
          error: {
            code: "FILE_DIVERGENCE_ERROR",
            message: divErr.message,
            retryable: false,
          },
          durationMs: Date.now() - startTime,
          executedAt,
        });
      }
    }

    // 7. Execution Boundary with Timeout & Cancellation
    const timeoutMs = req.timeoutMs || definition.timeoutMs || this.defaultTimeoutMs;
    const controller = new AbortController();

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });

    try {
      const execContext = {
        callId: req.callId,
        actor: req.actor,
        project: req.project,
        session: req.session,
        task: req.task,
        signal: controller.signal,
      };

      const result = await Promise.race([
        handler(req.arguments, execContext),
        timeoutPromise,
      ]);

      if (timeoutHandle) clearTimeout(timeoutHandle);
      releaseLockIfHeld();

      const observation = ToolObservationSchema.parse({
        callId: req.callId,
        toolName: req.toolName,
        status: "success",
        result,
        durationMs: Date.now() - startTime,
        executedAt,
        idempotencyKey: req.idempotencyKey,
        approvalId: req.approvalId,
      });

      if (definition.isIdempotent && req.idempotencyKey && this.idempotencyStore) {
        this.idempotencyStore.set(req.project.id, req.toolName, req.idempotencyKey, observation);
      }

      if (this.sideEffectJournal) {
        const category = this.sideEffectClassifier?.classify(req.toolName, req.arguments, definition) || (definition.isIdempotent ? "idempotent_write" : "unknown");
        this.sideEffectJournal.record({
          projectId: req.project.id,
          sessionId: req.session?.id,
          taskId: req.task?.id,
          callId: req.callId,
          toolName: req.toolName,
          category,
          outcomeCertainty: "known_succeeded",
          idempotencyKey: req.idempotencyKey,
          args: req.arguments,
          responseStatus: "success",
        });
      }

      if (this.eventStore) {
        this.eventStore.append({
          id: `evt_tool_comp_${req.callId}`,
          schemaVersion: 1,
          projectId: req.project.id,
          sessionId: req.session?.id,
          taskId: req.task?.id,
          type: EventTypes.TOOL_COMPLETED,
          actor: req.actor.type,
          timestamp: new Date().toISOString(),
          payload: {
            toolName: req.toolName,
            status: "success",
            durationMs: observation.durationMs,
          },
        });
      }

      return observation;
    } catch (err: any) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      releaseLockIfHeld();

      const isTimeout = err.message?.includes("timed out");
      const status = isTimeout ? "timeout" : "failure";
      const code = isTimeout ? "TIMEOUT" : "EXECUTOR_ERROR";

      // Secret sanitization
      const cleanMessage = String(err.message || "Tool execution failed").replace(
        /sk-[a-zA-Z0-9_-]{10,}/g,
        "[REDACTED_SECRET]"
      );

      const observation = ToolObservationSchema.parse({
        callId: req.callId,
        toolName: req.toolName,
        status,
        error: {
          code,
          message: cleanMessage,
          retryable: isTimeout && definition.isIdempotent,
        },
        durationMs: Date.now() - startTime,
        executedAt,
        idempotencyKey: req.idempotencyKey,
        approvalId: req.approvalId,
      });

      if (this.sideEffectJournal) {
        const category = this.sideEffectClassifier?.classify(req.toolName, req.arguments, definition) || (definition.isIdempotent ? "idempotent_write" : "unknown");
        this.sideEffectJournal.record({
          projectId: req.project.id,
          sessionId: req.session?.id,
          taskId: req.task?.id,
          callId: req.callId,
          toolName: req.toolName,
          category,
          outcomeCertainty: isTimeout ? "unknown" : "known_failed",
          idempotencyKey: req.idempotencyKey,
          args: req.arguments,
          responseStatus: status,
        });
      }

      if (this.eventStore) {
        this.eventStore.append({
          id: `evt_tool_fail_${req.callId}`,
          schemaVersion: 1,
          projectId: req.project.id,
          sessionId: req.session?.id,
          taskId: req.task?.id,
          type: EventTypes.TOOL_FAILED,
          actor: req.actor.type,
          timestamp: new Date().toISOString(),
          payload: {
            toolName: req.toolName,
            status,
            error: cleanMessage,
            code,
          },
        });
      }

      return observation;
    }
  }
}
