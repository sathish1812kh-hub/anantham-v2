import { z } from "zod";
import { EventStore } from "../event-state/event-store.js";

export const AirGappedModeSchema = z.enum([
  "ONLINE",
  "RESTRICTED_EGRESS",
  "STRICT_OFFLINE",
  "AIR_GAPPED_ISOLATED",
]);
export type AirGappedMode = z.infer<typeof AirGappedModeSchema>;

export const EgressAttemptSchema = z.object({
  targetUrl: z.string(),
  protocol: z.string().default("https:"),
  toolName: z.string().optional(),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  actor: z.string().default("agent"),
  timestamp: z.string().default(() => new Date().toISOString()),
});
export type EgressAttempt = z.infer<typeof EgressAttemptSchema>;

export const EgressDecisionSchema = z.object({
  allowed: z.boolean(),
  mode: AirGappedModeSchema,
  targetUrl: z.string(),
  ruleMatched: z.string(),
  violationReason: z.string().optional(),
  timestamp: z.string(),
});
export type EgressDecision = z.infer<typeof EgressDecisionSchema>;

export const AirGappedPolicyConfigSchema = z.object({
  mode: AirGappedModeSchema.default("ONLINE"),
  allowedEgressDomains: z.array(z.string()).default([]),
  allowLocalhost: z.boolean().default(true),
  enforceAirGappedToolSandbox: z.boolean().default(true),
  blockExternalModelEndpoints: z.boolean().default(false),
  localModelEndpoint: z.string().optional(),
});
export type AirGappedPolicyConfig = z.infer<typeof AirGappedPolicyConfigSchema>;

export class AirGappedViolationError extends Error {
  public readonly decision: EgressDecision;

  constructor(message: string, decision: EgressDecision) {
    super(message);
    this.name = "AirGappedViolationError";
    this.decision = decision;
  }
}

export interface AirGappedPolicyEnforcerOptions {
  eventStore?: EventStore;
  config?: Partial<AirGappedPolicyConfig>;
}

export class AirGappedPolicyEnforcer {
  private readonly eventStore?: EventStore;
  private config: AirGappedPolicyConfig;

  constructor(options: AirGappedPolicyEnforcerOptions = {}) {
    this.eventStore = options.eventStore;
    this.config = AirGappedPolicyConfigSchema.parse(options.config ?? {});
  }

  public getMode(): AirGappedMode {
    return this.config.mode;
  }

  public setMode(mode: AirGappedMode): void {
    this.config.mode = mode;
  }

  public updateConfig(newConfig: Partial<AirGappedPolicyConfig>): void {
    this.config = AirGappedPolicyConfigSchema.parse({ ...this.config, ...newConfig });
  }

  private isLocalhost(urlStr: string): boolean {
    try {
      const u = new URL(urlStr.includes("://") ? urlStr : "http://" + urlStr);
      const host = u.hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
    } catch {
      return false;
    }
  }

  private isDomainAllowed(urlStr: string): boolean {
    try {
      const u = new URL(urlStr.includes("://") ? urlStr : "http://" + urlStr);
      const host = u.hostname.toLowerCase();
      for (const allowed of this.config.allowedEgressDomains) {
        const allowedNorm = allowed.toLowerCase().trim();
        if (allowedNorm.startsWith("*.")) {
          const rootDomain = allowedNorm.slice(2);
          if (host === rootDomain || host.endsWith("." + rootDomain)) return true;
        } else if (host === allowedNorm) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  public evaluateEgress(attempt: EgressAttempt): EgressDecision {
    const validated = EgressAttemptSchema.parse(attempt);
    const now = new Date().toISOString();

    if (this.config.mode === "ONLINE") {
      return {
        allowed: true,
        mode: this.config.mode,
        targetUrl: validated.targetUrl,
        ruleMatched: "DEFAULT_ALLOW_ONLINE",
        timestamp: now,
      };
    }

    const isLocal = this.isLocalhost(validated.targetUrl);

    if (this.config.mode === "AIR_GAPPED_ISOLATED" || this.config.mode === "STRICT_OFFLINE") {
      if (this.config.allowLocalhost && isLocal) {
        return {
          allowed: true,
          mode: this.config.mode,
          targetUrl: validated.targetUrl,
          ruleMatched: "ALLOW_LOCALHOST_ONLY",
          timestamp: now,
        };
      }

      const decision: EgressDecision = {
        allowed: false,
        mode: this.config.mode,
        targetUrl: validated.targetUrl,
        ruleMatched: "BLOCK_ALL_EXTERNAL_EGRESS",
        violationReason: "AIR_GAPPED_POLICY_VIOLATION: Strict offline / air-gapped isolation mode blocks external network destination: " + validated.targetUrl,
        timestamp: now,
      };

      if (this.eventStore) {
        this.eventStore.append({
          id: "evt_egress_blk_" + Date.now(),
          schemaVersion: 1,
          projectId: validated.projectId,
          sessionId: validated.sessionId,
          type: "governance.egress_blocked",
          actor: "system",
          timestamp: now,
          payload: {
            targetUrl: validated.targetUrl,
            toolName: validated.toolName,
            mode: this.config.mode,
          },
        });
      }

      return decision;
    }

    // RESTRICTED_EGRESS mode
    if (isLocal && this.config.allowLocalhost) {
      return {
        allowed: true,
        mode: this.config.mode,
        targetUrl: validated.targetUrl,
        ruleMatched: "ALLOW_LOCALHOST",
        timestamp: now,
      };
    }

    const domainAllowed = this.isDomainAllowed(validated.targetUrl);
    if (domainAllowed) {
      return {
        allowed: true,
        mode: this.config.mode,
        targetUrl: validated.targetUrl,
        ruleMatched: "ALLOWLISTED_EGRESS_DOMAIN",
        timestamp: now,
      };
    }

    const decision: EgressDecision = {
      allowed: false,
      mode: this.config.mode,
      targetUrl: validated.targetUrl,
      ruleMatched: "UNLISTED_EGRESS_DOMAIN",
      violationReason: "RESTRICTED_EGRESS_POLICY_VIOLATION: Destination " + validated.targetUrl + " is not in the approved egress domains whitelist.",
      timestamp: now,
    };

    if (this.eventStore) {
      this.eventStore.append({
        id: "evt_egress_blk_" + Date.now(),
        schemaVersion: 1,
        projectId: validated.projectId,
        sessionId: validated.sessionId,
        type: "governance.egress_blocked",
        actor: "system",
        timestamp: now,
        payload: {
          targetUrl: validated.targetUrl,
          toolName: validated.toolName,
          mode: this.config.mode,
        },
      });
    }

    return decision;
  }

  public assertEgressAllowed(attempt: EgressAttempt): void {
    const decision = this.evaluateEgress(attempt);
    if (!decision.allowed) {
      throw new AirGappedViolationError(decision.violationReason || "Egress prohibited", decision);
    }
  }

  public interceptModelRequest(
    endpointUrl: string,
    providerId: string
  ): { allowed: boolean; redirectUrl?: string; violationReason?: string } {
    if (this.config.mode === "ONLINE") {
      return { allowed: true };
    }

    const isLocal = this.isLocalhost(endpointUrl);
    if (isLocal) {
      return { allowed: true };
    }

    if (this.config.blockExternalModelEndpoints || this.config.mode === "AIR_GAPPED_ISOLATED" || this.config.mode === "STRICT_OFFLINE") {
      if (this.config.localModelEndpoint) {
        return {
          allowed: true,
          redirectUrl: this.config.localModelEndpoint,
        };
      }
      return {
        allowed: false,
        violationReason: "External AI model endpoint call to " + endpointUrl + " (" + providerId + ") blocked by air-gapped policy.",
      };
    }

    if (this.config.mode === "RESTRICTED_EGRESS") {
      if (this.isDomainAllowed(endpointUrl)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        violationReason: "Model endpoint " + endpointUrl + " not in approved egress domains.",
      };
    }

    return { allowed: true };
  }

  public interceptToolExecution(
    toolName: string,
    targetEndpoint?: string
  ): { allowed: boolean; violationReason?: string } {
    if (this.config.mode === "ONLINE") {
      return { allowed: true };
    }

    const networkTools = ["web_search", "fetch_url", "http_request", "read_url_content", "curl", "wget"];
    if (networkTools.includes(toolName.toLowerCase())) {
      if (!targetEndpoint) {
        return {
          allowed: false,
          violationReason: "Network tool " + toolName + " is forbidden under " + this.config.mode + " mode without a verified local endpoint.",
        };
      }
      const egressDec = this.evaluateEgress({ targetUrl: targetEndpoint, toolName, protocol: "https:", actor: "agent", timestamp: new Date().toISOString() });
      if (!egressDec.allowed) {
        return {
          allowed: false,
          violationReason: egressDec.violationReason,
        };
      }
    }

    return { allowed: true };
  }
}
