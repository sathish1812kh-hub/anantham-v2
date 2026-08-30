import type { SqliteEngine } from "../persistence/sqlite-engine.js";
import type { RecoveryAnomaly } from "./recovery-record.js";

export interface OrphanDetectionReport {
  orphanTasks: string[];
  orphanSessions: string[];
  orphanArtifacts: string[];
  orphanAttachments: string[];
  orphanCheckpoints: string[];
  anomalies: RecoveryAnomaly[];
  totalOrphansCount: number;
}

export class OrphanDetector {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  /**
   * Scans SQLite relational tables for referential orphans and consistency gaps.
   */
  public detectOrphans(): OrphanDetectionReport {
    const anomalies: RecoveryAnomaly[] = [];
    const timestamp = new Date().toISOString();

    // 1. Orphan tasks (tasks where session_id does not exist in sessions)
    const orphanTaskStmt = this.engine.raw.prepare(`
      SELECT t.id FROM tasks t
      LEFT JOIN sessions s ON t.session_id = s.id
      WHERE s.id IS NULL;
    `);
    const orphanTaskRows = orphanTaskStmt.all() as Array<{ id: string }>;
    const orphanTasks = orphanTaskRows.map((r) => r.id);
    for (const taskId of orphanTasks) {
      anomalies.push({
        type: "UNCOMMITTED_TASK",
        entityId: taskId,
        description: `Task '${taskId}' references non-existent session.`,
        actionTaken: "FLAGGED",
        timestamp,
      });
    }

    // 2. Orphan sessions (child sessions where parent_session_id is non-null but does not exist)
    const orphanSessionStmt = this.engine.raw.prepare(`
      SELECT s.id, s.parent_session_id FROM sessions s
      LEFT JOIN sessions p ON s.parent_session_id = p.id
      WHERE s.parent_session_id IS NOT NULL AND p.id IS NULL;
    `);
    const orphanSessionRows = orphanSessionStmt.all() as Array<{ id: string; parent_session_id: string }>;
    const orphanSessions = orphanSessionRows.map((r) => r.id);
    for (const row of orphanSessionRows) {
      anomalies.push({
        type: "INTEGRITY_VIOLATION",
        entityId: row.id,
        description: `Session '${row.id}' references non-existent parentSessionId '${row.parent_session_id}'.`,
        actionTaken: "FLAGGED",
        timestamp,
      });
    }

    // 3. Orphan artifacts (artifacts referencing non-existent session)
    const orphanArtifactStmt = this.engine.raw.prepare(`
      SELECT a.id FROM artifacts a
      LEFT JOIN sessions s ON a.session_id = s.id
      WHERE s.id IS NULL;
    `);
    const orphanArtifactRows = orphanArtifactStmt.all() as Array<{ id: string }>;
    const orphanArtifacts = orphanArtifactRows.map((r) => r.id);
    for (const artifactId of orphanArtifacts) {
      anomalies.push({
        type: "ORPHAN_ARTIFACT",
        entityId: artifactId,
        description: `Artifact '${artifactId}' references non-existent session.`,
        actionTaken: "PRESERVED",
        timestamp,
      });
    }

    // 4. Orphan attachments (attachments referencing non-existent session)
    const orphanAttachmentStmt = this.engine.raw.prepare(`
      SELECT att.id FROM attachments att
      LEFT JOIN sessions s ON att.session_id = s.id
      WHERE s.id IS NULL;
    `);
    const orphanAttachmentRows = orphanAttachmentStmt.all() as Array<{ id: string }>;
    const orphanAttachments = orphanAttachmentRows.map((r) => r.id);
    for (const attachmentId of orphanAttachments) {
      anomalies.push({
        type: "ORPHAN_ARTIFACT",
        entityId: attachmentId,
        description: `Attachment '${attachmentId}' references non-existent session.`,
        actionTaken: "PRESERVED",
        timestamp,
      });
    }

    // 5. Orphan checkpoints (checkpoints referencing non-existent session)
    const orphanCheckpointStmt = this.engine.raw.prepare(`
      SELECT chk.id FROM checkpoints chk
      LEFT JOIN sessions s ON chk.session_id = s.id
      WHERE s.id IS NULL;
    `);
    const orphanCheckpointRows = orphanCheckpointStmt.all() as Array<{ id: string }>;
    const orphanCheckpoints = orphanCheckpointRows.map((r) => r.id);
    for (const chkId of orphanCheckpoints) {
      anomalies.push({
        type: "CORRUPTED_CHECKPOINT",
        entityId: chkId,
        description: `Checkpoint '${chkId}' references non-existent session.`,
        actionTaken: "FLAGGED",
        timestamp,
      });
    }

    const totalOrphansCount =
      orphanTasks.length +
      orphanSessions.length +
      orphanArtifacts.length +
      orphanAttachments.length +
      orphanCheckpoints.length;

    return {
      orphanTasks,
      orphanSessions,
      orphanArtifacts,
      orphanAttachments,
      orphanCheckpoints,
      anomalies,
      totalOrphansCount,
    };
  }
}
