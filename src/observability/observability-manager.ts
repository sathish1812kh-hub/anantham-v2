import { type SqliteEngine } from "../persistence/sqlite-engine.js";
import { type EventStore } from "../event-state/event-store.js";
import { type TaskRepository } from "../persistence/repositories/task-repository.js";
import { type LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { type JobRepository } from "../persistence/repositories/job-repository.js";
import { AuditLogger } from "./audit-logger.js";
import { SecurityEventClassifier } from "./security-event-classifier.js";
import { TelemetryEngine } from "./telemetry-engine.js";
import { DiagnosticInspector } from "./diagnostic-inspector.js";
import { ComplianceExporter } from "./compliance-exporter.js";

export interface ObservabilityManagerOptions {
  engine: SqliteEngine;
  eventStore: EventStore;
  taskRepo?: TaskRepository;
  leaseRepo?: LeaseRepository;
  jobRepo?: JobRepository;
}

/**
 * Central Observability & Governance Manager.
 * PRD Part 2 Section 260–280 / PRD Part 3 Section 85–100.
 */
export class ObservabilityManager {
  public readonly auditLogger: AuditLogger;
  public readonly telemetry: TelemetryEngine;
  public readonly diagnostics: DiagnosticInspector;
  public readonly compliance: ComplianceExporter;
  private readonly eventStore: EventStore;
  private unsubscribe?: () => void;

  constructor(options: ObservabilityManagerOptions) {
    this.eventStore = options.eventStore;
    this.auditLogger = new AuditLogger();
    this.telemetry = new TelemetryEngine();
    this.diagnostics = new DiagnosticInspector({
      engine: options.engine,
      taskRepo: options.taskRepo,
      leaseRepo: options.leaseRepo,
      jobRepo: options.jobRepo,
    });
    this.compliance = new ComplianceExporter(this.auditLogger);
  }

  public start(): void {
    if (this.unsubscribe) return;

    // Automatically ingest authoritative EventStore events into audit log
    this.unsubscribe = this.eventStore.subscribe({}, (event) => {
      const decision = event.type.includes("denied")
        ? "DENY"
        : event.type.includes("approved")
        ? "PERMIT"
        : "MONITOR";

      const classification = SecurityEventClassifier.classify(event, decision);

      this.auditLogger.record({
        event,
        actor: event.actor ?? "system",
        action: event.type,
        classification,
        decision,
        reasonCode: `EVENT_${event.type.toUpperCase().replace(/\./g, "_")}`,
        metadata: {},
      });

      // Track metric counter for event
      this.telemetry.incrementCounter(`events.${event.type}`, 1, {
        projectId: event.projectId,
        sessionId: event.sessionId,
      });
    });
  }

  public stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }
}
