import { createHash, randomUUID } from "node:crypto";
import { type HarnessEvent } from "../domain/event.js";

import {
  type SecurityAuditRecord,
  type SecurityEventClassification,
  SecurityAuditRecordSchema,
} from "../domain/observability.js";
import { ContentSanitizer } from "../content/content-sanitizer.js";

export interface AuditQueryOptions {
  projectId?: string;
  classification?: SecurityEventClassification;
  decision?: "PERMIT" | "DENY" | "MONITOR" | "RETRY_EXHAUSTED" | "UNKNOWN";
  limit?: number;
}

export interface VerificationResult {
  valid: boolean;
  tamperedIndex?: number;
  message?: string;
}

/**
 * Cryptographic Tamper-Evident Audit Logger.
 * PRD Part 1 Section 40 / PRD Part 3 Section 85.
 */
export class AuditLogger {
  private readonly records: SecurityAuditRecord[] = [];
  private lastDigest: string = "0000000000000000000000000000000000000000000000000000000000000000";

  /**
   * Deterministically compute SHA-256 hash over canonical JSON representation.
   */
  public static computeDigest(obj: unknown): string {
    const canonicalJson = (value: unknown): string => {
      if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
      }
      if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
      }
      const keys = Object.keys(value as Record<string, unknown>).sort();
      const entries = keys.map(
        (k) => `"${k}":${canonicalJson((value as Record<string, unknown>)[k])}`
      );
      return `{${entries.join(",")}}`;
    };

    return createHash("sha256").update(canonicalJson(obj)).digest("hex");
  }

  /**
   * Record a security/audit event with cryptographic digest chaining.
   */
  public record(params: {
    event: Partial<HarnessEvent>;
    actor: string;
    action: string;
    classification: SecurityEventClassification;
    decision: "PERMIT" | "DENY" | "MONITOR" | "RETRY_EXHAUSTED" | "UNKNOWN";
    reasonCode: string;
    metadata?: Record<string, unknown>;
  }): SecurityAuditRecord {
    const auditId = `audit_${randomUUID().slice(0, 8)}`;
    const eventId = params.event.id ?? `evt_${randomUUID().slice(0, 8)}`;
    const timestamp = params.event.timestamp ?? new Date().toISOString();

    // 1. Sanitize payload to guarantee zero secret leakage
    const sanitizedPayload = ContentSanitizer.sanitize(
      (params.event.payload ?? {}) as Record<string, unknown>
    );
    const payloadDigest = AuditLogger.computeDigest(sanitizedPayload);

    // 2. Compute canonical record digest including previousRecordDigest
    const previousRecordDigest = this.lastDigest;
    const recordContentForDigest = {
      auditId,
      eventId,
      timestamp,
      projectId: params.event.projectId,
      sessionId: params.event.sessionId,
      taskId: params.event.taskId,
      agentId: params.event.agentId,
      actor: params.actor,
      action: params.action,
      classification: params.classification,
      decision: params.decision,
      reasonCode: params.reasonCode,
      correlationId: params.event.correlationId,
      parentEventId: params.event.parentEventId,
      payloadDigest,
      previousRecordDigest,
    };

    const recordDigest = AuditLogger.computeDigest(recordContentForDigest);

    const record: SecurityAuditRecord = SecurityAuditRecordSchema.parse({
      ...recordContentForDigest,
      schemaVersion: 1,
      metadata: params.metadata ?? {},
      recordDigest,
    });

    this.records.push(record);
    this.lastDigest = recordDigest;

    return record;
  }

  /**
   * Cryptographically verify the integrity of the audit chain.
   */
  public static verifyChain(records: SecurityAuditRecord[]): VerificationResult {
    let expectedPrevious = "0000000000000000000000000000000000000000000000000000000000000000";

    for (let i = 0; i < records.length; i++) {
      const rec = records[i]!;

      // 1. Verify previousRecordDigest links to previous record
      if (rec.previousRecordDigest !== expectedPrevious) {
        return {
          valid: false,
          tamperedIndex: i,
          message: `Digest chain broken at index ${i}: expected previous '${expectedPrevious}', found '${rec.previousRecordDigest}'`,
        };
      }

      // 2. Recompute recordDigest over canonical fields
      const content = {
        auditId: rec.auditId,
        eventId: rec.eventId,
        timestamp: rec.timestamp,
        projectId: rec.projectId,
        sessionId: rec.sessionId,
        taskId: rec.taskId,
        agentId: rec.agentId,
        actor: rec.actor,
        action: rec.action,
        classification: rec.classification,
        decision: rec.decision,
        reasonCode: rec.reasonCode,
        correlationId: rec.correlationId,
        parentEventId: rec.parentEventId,
        payloadDigest: rec.payloadDigest,
        previousRecordDigest: rec.previousRecordDigest,
      };

      const computed = AuditLogger.computeDigest(content);
      if (computed !== rec.recordDigest) {
        return {
          valid: false,
          tamperedIndex: i,
          message: `Record digest tampered at index ${i}: expected '${computed}', found '${rec.recordDigest}'`,
        };
      }

      expectedPrevious = rec.recordDigest;
    }

    return { valid: true };
  }

  /**
   * Query audit records with project isolation.
   */
  public query(options: AuditQueryOptions): SecurityAuditRecord[] {
    let results = this.records;

    if (options.projectId) {
      results = results.filter((r) => r.projectId === options.projectId);
    }
    if (options.classification) {
      results = results.filter((r) => r.classification === options.classification);
    }
    if (options.decision) {
      results = results.filter((r) => r.decision === options.decision);
    }

    const limit = options.limit ?? 100;
    return results.slice(-limit);
  }

  public getHeadDigest(): string {
    return this.lastDigest;
  }

  public getAllRecords(): SecurityAuditRecord[] {
    return [...this.records];
  }
}
