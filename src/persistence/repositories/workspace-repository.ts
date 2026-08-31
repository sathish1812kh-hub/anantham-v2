import {
  type ExecutionWorkspace,
  ExecutionWorkspaceSchema,
  type ChangeSetMetadata,
  ChangeSetMetadataSchema,
  type ConflictReport,
  ConflictReportSchema,
  type WorkspaceQuarantineRecord,
  WorkspaceQuarantineRecordSchema,
  type WorkspaceStatus,
} from "../../domain/workspace.js";
import { SqliteEngine } from "../sqlite-engine.js";

interface WorkspaceRow {
  id: string;
  project_id: string;
  task_id: string;
  agent_id: string;
  instance_id: string;
  lease_id: string;
  generation: number;
  base_commit: string;
  base_branch: string;
  worktree_path: string;
  branch_name: string;
  status: string;
  cleanup_state: string;
  quarantine_reason: string | null;
  metadata_json: string | null;
  created_at: string;
  last_verified_at: string;
}

interface ChangeSetRow {
  workspace_id: string;
  base_commit: string;
  head_commit: string;
  target_commit: string;
  files_added_json: string;
  files_modified_json: string;
  files_deleted_json: string;
  files_renamed_json: string;
  file_hashes_json: string;
  symbols_modified_json: string | null;
  patch: string;
  change_set_hash: string;
  created_at: string;
}

interface ConflictReportRow {
  id: string;
  workspace_id: string;
  conflicting_workspace_id: string | null;
  conflict_type: string;
  conflicting_files_json: string;
  conflicting_symbols_json: string | null;
  details: string;
  suggestion: string | null;
  detected_at: string;
}

interface QuarantineRow {
  id: string;
  workspace_id: string;
  reason: string;
  patch: string;
  exported_artifact_id: string | null;
  created_at: string;
}

export class WorkspaceRepository {
  constructor(private readonly engine: SqliteEngine) {}

  public save(workspace: ExecutionWorkspace): void {
    const validated = ExecutionWorkspaceSchema.parse(workspace);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO workspaces (
        id, project_id, task_id, agent_id, instance_id, lease_id, generation,
        base_commit, base_branch, worktree_path, branch_name, status,
        cleanup_state, quarantine_reason, metadata_json, created_at, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        base_commit = excluded.base_commit,
        base_branch = excluded.base_branch,
        status = excluded.status,
        cleanup_state = excluded.cleanup_state,
        quarantine_reason = excluded.quarantine_reason,
        metadata_json = excluded.metadata_json,
        last_verified_at = excluded.last_verified_at;
    `);

    stmt.run(
      validated.id,
      validated.projectId,
      validated.taskId,
      validated.agentId,
      validated.instanceId,
      validated.leaseId,
      validated.generation,
      validated.baseCommit,
      validated.baseBranch,
      validated.worktreePath,
      validated.branchName,
      validated.status,
      validated.cleanupState,
      validated.quarantineReason ?? null,
      validated.metadata ? JSON.stringify(validated.metadata) : null,
      validated.createdAt,
      validated.lastVerifiedAt
    );
  }

  public findById(id: string): ExecutionWorkspace | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM workspaces WHERE id = ?;`);
    const row = stmt.get(id) as WorkspaceRow | undefined;
    return row ? this.rowToWorkspace(row) : null;
  }

  public findByTaskId(taskId: string): ExecutionWorkspace[] {
    const stmt = this.engine.raw.prepare(`SELECT * FROM workspaces WHERE task_id = ? ORDER BY created_at DESC;`);
    const rows = stmt.all(taskId) as unknown as WorkspaceRow[];
    return rows.map((r) => this.rowToWorkspace(r));
  }

  public findByLeaseId(leaseId: string): ExecutionWorkspace | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM workspaces WHERE lease_id = ? LIMIT 1;`);
    const row = stmt.get(leaseId) as WorkspaceRow | undefined;
    return row ? this.rowToWorkspace(row) : null;
  }

  public findActiveByProjectId(projectId: string): ExecutionWorkspace[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM workspaces
      WHERE project_id = ? AND status NOT IN ('CLEANED', 'FAILED', 'INTEGRATED')
      ORDER BY created_at DESC;
    `);
    const rows = stmt.all(projectId) as unknown as WorkspaceRow[];
    return rows.map((r) => this.rowToWorkspace(r));
  }

  public updateStatus(
    id: string,
    status: WorkspaceStatus,
    quarantineReason?: string
  ): void {
    const now = new Date().toISOString();
    const stmt = this.engine.raw.prepare(`
      UPDATE workspaces
      SET status = ?, quarantine_reason = COALESCE(?, quarantine_reason), last_verified_at = ?
      WHERE id = ?;
    `);
    stmt.run(status, quarantineReason ?? null, now, id);
  }

  public updateCleanupState(id: string, cleanupState: string): void {
    const stmt = this.engine.raw.prepare(`
      UPDATE workspaces
      SET cleanup_state = ?
      WHERE id = ?;
    `);
    stmt.run(cleanupState, id);
  }

  public saveChangeSet(changeSet: ChangeSetMetadata): void {
    const validated = ChangeSetMetadataSchema.parse(changeSet);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO workspace_changesets (
        workspace_id, base_commit, head_commit, target_commit,
        files_added_json, files_modified_json, files_deleted_json, files_renamed_json,
        file_hashes_json, symbols_modified_json, patch, change_set_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        head_commit = excluded.head_commit,
        target_commit = excluded.target_commit,
        files_added_json = excluded.files_added_json,
        files_modified_json = excluded.files_modified_json,
        files_deleted_json = excluded.files_deleted_json,
        files_renamed_json = excluded.files_renamed_json,
        file_hashes_json = excluded.file_hashes_json,
        symbols_modified_json = excluded.symbols_modified_json,
        patch = excluded.patch,
        change_set_hash = excluded.change_set_hash;
    `);

    stmt.run(
      validated.workspaceId,
      validated.baseCommit,
      validated.headCommit,
      validated.targetCommit,
      JSON.stringify(validated.filesAdded),
      JSON.stringify(validated.filesModified),
      JSON.stringify(validated.filesDeleted),
      JSON.stringify(validated.filesRenamed),
      JSON.stringify(validated.fileHashes),
      validated.symbolsModified ? JSON.stringify(validated.symbolsModified) : null,
      validated.patch,
      validated.changeSetHash,
      validated.createdAt
    );
  }

  public getChangeSet(workspaceId: string): ChangeSetMetadata | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM workspace_changesets WHERE workspace_id = ?;`);
    const row = stmt.get(workspaceId) as ChangeSetRow | undefined;
    return row ? this.rowToChangeSet(row) : null;
  }

  public saveConflictReport(report: ConflictReport): void {
    const validated = ConflictReportSchema.parse(report);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO workspace_conflict_reports (
        id, workspace_id, conflicting_workspace_id, conflict_type,
        conflicting_files_json, conflicting_symbols_json, details, suggestion, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        details = excluded.details,
        suggestion = excluded.suggestion;
    `);

    stmt.run(
      validated.id,
      validated.workspaceId,
      validated.conflictingWorkspaceId ?? null,
      validated.conflictType,
      JSON.stringify(validated.conflictingFiles),
      validated.conflictingSymbols ? JSON.stringify(validated.conflictingSymbols) : null,
      validated.details,
      validated.reconciliationSuggestion ?? null,
      validated.detectedAt
    );
  }

  public getConflictReport(workspaceId: string): ConflictReport | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM workspace_conflict_reports
      WHERE workspace_id = ?
      ORDER BY detected_at DESC
      LIMIT 1;
    `);
    const row = stmt.get(workspaceId) as ConflictReportRow | undefined;
    return row ? this.rowToConflictReport(row) : null;
  }

  public saveQuarantineRecord(record: WorkspaceQuarantineRecord): void {
    const validated = WorkspaceQuarantineRecordSchema.parse(record);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO workspace_quarantine_records (
        id, workspace_id, reason, patch, exported_artifact_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING;
    `);

    stmt.run(
      validated.id,
      validated.workspaceId,
      validated.reason,
      validated.patch,
      validated.exportedArtifactId ?? null,
      validated.createdAt
    );
  }

  public getQuarantineRecords(workspaceId: string): WorkspaceQuarantineRecord[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM workspace_quarantine_records
      WHERE workspace_id = ?
      ORDER BY created_at DESC;
    `);
    const rows = stmt.all(workspaceId) as unknown as QuarantineRow[];
    return rows.map((r) => this.rowToQuarantineRecord(r));
  }

  private rowToWorkspace(row: WorkspaceRow): ExecutionWorkspace {
    return ExecutionWorkspaceSchema.parse({
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentId: row.agent_id,
      instanceId: row.instance_id,
      leaseId: row.lease_id,
      generation: row.generation,
      baseCommit: row.base_commit,
      baseBranch: row.base_branch,
      worktreePath: row.worktree_path,
      branchName: row.branch_name,
      status: row.status,
      cleanupState: row.cleanup_state,
      quarantineReason: row.quarantine_reason ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      createdAt: row.created_at,
      lastVerifiedAt: row.last_verified_at,
    });
  }

  private rowToChangeSet(row: ChangeSetRow): ChangeSetMetadata {
    return ChangeSetMetadataSchema.parse({
      workspaceId: row.workspace_id,
      baseCommit: row.base_commit,
      headCommit: row.head_commit,
      targetCommit: row.target_commit,
      filesAdded: JSON.parse(row.files_added_json),
      filesModified: JSON.parse(row.files_modified_json),
      filesDeleted: JSON.parse(row.files_deleted_json),
      filesRenamed: JSON.parse(row.files_renamed_json),
      fileHashes: JSON.parse(row.file_hashes_json),
      symbolsModified: row.symbols_modified_json ? JSON.parse(row.symbols_modified_json) : undefined,
      patch: row.patch,
      changeSetHash: row.change_set_hash,
      createdAt: row.created_at,
    });
  }

  private rowToConflictReport(row: ConflictReportRow): ConflictReport {
    return ConflictReportSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      conflictingWorkspaceId: row.conflicting_workspace_id ?? undefined,
      conflictType: row.conflict_type,
      conflictingFiles: JSON.parse(row.conflicting_files_json),
      conflictingSymbols: row.conflicting_symbols_json ? JSON.parse(row.conflicting_symbols_json) : undefined,
      details: row.details,
      reconciliationSuggestion: row.suggestion ?? undefined,
      detectedAt: row.detected_at,
    });
  }

  private rowToQuarantineRecord(row: QuarantineRow): WorkspaceQuarantineRecord {
    return WorkspaceQuarantineRecordSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      reason: row.reason,
      patch: row.patch,
      exportedArtifactId: row.exported_artifact_id ?? undefined,
      createdAt: row.created_at,
    });
  }
}
