/**
 * Compliance Audit Logger & Cryptographic Hash Chain
 * PRD-OBS-003: Audit Logging & Compliance Event Trail
 */

import { createHash } from "node:crypto";

export interface ComplianceAuditEvent {
  id: string;
  sequence: number;
  actor: string;
  action: string;
  resource: string;
  payloadHash: string;
  previousHash: string;
  recordHash: string;
  timestamp: string;
}

export class ComplianceAuditLogger {
  private chain: ComplianceAuditEvent[] = [];
  private lastHash = "0".repeat(64); // Genesis hash

  public logEvent(actor: string, action: string, resource: string, payload: unknown): ComplianceAuditEvent {
    const sequence = this.chain.length + 1;
    const timestamp = new Date().toISOString();
    const payloadStr = JSON.stringify(payload ?? {});
    const payloadHash = createHash("sha256").update(payloadStr).digest("hex");

    const previousHash = this.lastHash;
    const recordContent = `${sequence}:${actor}:${action}:${resource}:${payloadHash}:${previousHash}:${timestamp}`;
    const recordHash = createHash("sha256").update(recordContent).digest("hex");

    const event: ComplianceAuditEvent = {
      id: `audit_${sequence}_${recordHash.slice(0, 8)}`,
      sequence,
      actor,
      action,
      resource,
      payloadHash,
      previousHash,
      recordHash,
      timestamp,
    };

    this.chain.push(event);
    this.lastHash = recordHash;

    return event;
  }

  public verifyChainIntegrity(): { isValid: boolean; brokenAtSequence?: number } {
    let expectedPrevious = "0".repeat(64);

    for (let i = 0; i < this.chain.length; i++) {
      const event = this.chain[i]!;

      if (event.previousHash !== expectedPrevious) {
        return { isValid: false, brokenAtSequence: event.sequence };
      }

      const recordContent = `${event.sequence}:${event.actor}:${event.action}:${event.resource}:${event.payloadHash}:${event.previousHash}:${event.timestamp}`;
      const recomputedHash = createHash("sha256").update(recordContent).digest("hex");

      if (recomputedHash !== event.recordHash) {
        return { isValid: false, brokenAtSequence: event.sequence };
      }

      expectedPrevious = event.recordHash;
    }

    return { isValid: true };
  }

  public getEvents(): ComplianceAuditEvent[] {
    return [...this.chain];
  }
}
