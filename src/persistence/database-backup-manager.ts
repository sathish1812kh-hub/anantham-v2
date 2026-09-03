import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from "node:crypto";
import { z } from "zod";
import { SqliteEngine } from "./sqlite-engine.js";

export const BackupScopeSchema = z.object({
  projectId: z.string().optional(),
  includeArtifacts: z.boolean().default(true),
  includeAttachments: z.boolean().default(true),
  includeWorkflows: z.boolean().default(true),
  includeConfig: z.boolean().default(true),
  includePluginMetadata: z.boolean().default(true),
  includeSkillMetadata: z.boolean().default(true),
});
export type BackupScope = z.infer<typeof BackupScopeSchema>;

export const BackupEncryptionMetadataSchema = z.object({
  enabled: z.boolean(),
  algorithm: z.enum(["AES-256-GCM"]).optional(),
  keyDerivation: z.enum(["PBKDF2", "RAW"]).optional(),
  saltHex: z.string().optional(),
  ivHex: z.string().optional(),
  tagHex: z.string().optional(),
  iterations: z.number().int().positive().optional(),
});
export type BackupEncryptionMetadata = z.infer<typeof BackupEncryptionMetadataSchema>;

export const BackupEntityCountsSchema = z.object({
  projects: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  tasks: z.number().int().nonnegative(),
  checkpoints: z.number().int().nonnegative(),
  memoryItems: z.number().int().nonnegative(),
  artifacts: z.number().int().nonnegative(),
  attachments: z.number().int().nonnegative(),
});
export type BackupEntityCounts = z.infer<typeof BackupEntityCountsSchema>;

export const BackupManifestSchema = z.object({
  backupId: z.string().min(1),
  version: z.literal(1),
  createdAt: z.string().min(1),
  generator: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  scope: BackupScopeSchema,
  counts: BackupEntityCountsSchema,
  checksums: z.object({
    dbSha256: z.string().length(64),
    manifestSha256: z.string().length(64),
    artifactChecksums: z.record(z.string(), z.string()).optional(),
  }),
  encryption: BackupEncryptionMetadataSchema,
  credentialsExcluded: z.literal(true),
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

export interface CreateBackupOptions {
  destinationPath?: string;
  scope?: Partial<BackupScope>;
  passphrase?: string;
  keyBuffer?: Buffer;
  label?: string;
}

export interface RestoreDryRunReport {
  backupId: string;
  createdAt: string;
  schemaVersion: number;
  isCompatible: boolean;
  counts: BackupEntityCounts;
  conflicts: {
    existingProjectsCount: number;
    existingSessionsCount: number;
    existingTasksCount: number;
    conflictingProjectIds: string[];
    conflictingSessionIds: string[];
  };
  integrityCheckPassed: boolean;
  foreignKeyCheckPassed: boolean;
  warnings: string[];
  errors: string[];
}

export interface RestoreOptions {
  passphrase?: string;
  keyBuffer?: Buffer;
  force?: boolean;
  targetDbPath?: string;
  targetArtifactsDir?: string;
}

export interface RestoreResult {
  success: boolean;
  backupId: string;
  restoredAt: string;
  restoredCounts: BackupEntityCounts;
  durationMs: number;
  report: RestoreDryRunReport;
}

export interface DatabaseBackupManagerOptions {
  engine: SqliteEngine;
  artifactsDir?: string;
  attachmentsDir?: string;
  backupStorageDir?: string;
}

export class DatabaseBackupManager {
  private readonly engine: SqliteEngine;
  private readonly backupStorageDir: string;

  constructor(options: DatabaseBackupManagerOptions) {
    this.engine = options.engine;
    this.backupStorageDir = options.backupStorageDir ?? join(process.cwd(), ".anantham", "backups");
  }

  private countTable(tableName: string): number {
    try {
      const row = this.engine.raw.prepare(`SELECT COUNT(*) as count FROM ${tableName};`).get() as { count: number } | undefined;
      return row ? Number(row.count) : 0;
    } catch {
      return 0;
    }
  }

  public getEntityCounts(): BackupEntityCounts {
    return {
      projects: this.countTable("projects"),
      sessions: this.countTable("sessions"),
      events: this.countTable("events"),
      tasks: this.countTable("tasks"),
      checkpoints: this.countTable("checkpoints"),
      memoryItems: this.countTable("memory_items"),
      artifacts: this.countTable("artifacts"),
      attachments: this.countTable("attachments"),
    };
  }

  private deriveKey(passphrase?: string, keyBuffer?: Buffer, salt?: Buffer): Buffer {
    if (keyBuffer) {
      return keyBuffer;
    }
    if (passphrase && salt) {
      return pbkdf2Sync(passphrase, salt, 100_000, 32, "sha256");
    }
    throw new Error("Passphrase or 32-byte keyBuffer required for encryption/decryption.");
  }

  public async createBackup(options?: CreateBackupOptions): Promise<{ backupPath: string; manifest: BackupManifest }> {
    const backupId = `bak_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const targetDir = options?.destinationPath ?? join(this.backupStorageDir, backupId);
    mkdirSync(targetDir, { recursive: true });

    // 1. Hot online backup using VACUUM INTO
    const tempDbPath = join(targetDir, "anantham.sqlite");
    this.engine.backup(tempDbPath);

    // 2. Compute DB hash
    const dbBytes = readFileSync(tempDbPath);
    const dbSha256 = createHash("sha256").update(dbBytes).digest("hex");

    // 3. Encryption if requested
    let encryptionMeta: BackupEncryptionMetadata = { enabled: false };
    if (options?.passphrase || options?.keyBuffer) {
      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const key = this.deriveKey(options.passphrase, options.keyBuffer, salt);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encryptedDb = Buffer.concat([cipher.update(dbBytes), cipher.final()]);
      const authTag = cipher.getAuthTag();

      const encDbPath = join(targetDir, "anantham.sqlite.enc");
      writeFileSync(encDbPath, encryptedDb);
      unlinkSync(tempDbPath);

      encryptionMeta = {
        enabled: true,
        algorithm: "AES-256-GCM",
        keyDerivation: options.passphrase ? "PBKDF2" : "RAW",
        saltHex: salt.toString("hex"),
        ivHex: iv.toString("hex"),
        tagHex: authTag.toString("hex"),
        iterations: options.passphrase ? 100_000 : undefined,
      };
    }

    // 4. Gather counts and build manifest
    const counts = this.getEntityCounts();
    const manifestDraft = {
      backupId,
      version: 1 as const,
      createdAt: new Date().toISOString(),
      generator: "anantham-database-backup-manager-v2",
      schemaVersion: 11,
      scope: BackupScopeSchema.parse(options?.scope ?? {}),
      counts,
      checksums: {
        dbSha256,
        manifestSha256: "",
      },
      encryption: encryptionMeta,
      credentialsExcluded: true as const,
    };

    const manifestJsonString = JSON.stringify(manifestDraft, null, 2);
    const manifestSha256 = createHash("sha256").update(manifestJsonString).digest("hex");
    const finalManifest: BackupManifest = {
      ...manifestDraft,
      checksums: {
        ...manifestDraft.checksums,
        manifestSha256,
      },
    };

    writeFileSync(join(targetDir, "manifest.json"), JSON.stringify(finalManifest, null, 2), "utf-8");

    return {
      backupPath: targetDir,
      manifest: finalManifest,
    };
  }

  public async inspectBackup(backupPath: string, _options?: { passphrase?: string; keyBuffer?: Buffer }): Promise<BackupManifest> {
    const manifestFile = existsSync(join(backupPath, "manifest.json"))
      ? join(backupPath, "manifest.json")
      : backupPath;

    if (!existsSync(manifestFile)) {
      throw new Error(`Manifest not found at path: ${manifestFile}`);
    }

    const raw = readFileSync(manifestFile, "utf-8");
    const manifest = BackupManifestSchema.parse(JSON.parse(raw));

    return manifest;
  }

  public async dryRunRestore(backupPath: string, options?: { passphrase?: string; keyBuffer?: Buffer }): Promise<RestoreDryRunReport> {
    const manifest = await this.inspectBackup(backupPath, options);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check schema compatibility
    const isCompatible = manifest.schemaVersion <= 11;
    if (!isCompatible) {
      errors.push(`Backup schema version ${manifest.schemaVersion} is newer than engine maximum schema version 11.`);
    }

    // Check conflicts with live engine
    let existingProjectsCount = 0;
    let existingSessionsCount = 0;
    let existingTasksCount = 0;
    const conflictingProjectIds: string[] = [];
    const conflictingSessionIds: string[] = [];

    try {
      existingProjectsCount = this.countTable("projects");
      existingSessionsCount = this.countTable("sessions");
      existingTasksCount = this.countTable("tasks");

      if (existingProjectsCount > 0) {
        warnings.push(`Target database currently contains ${existingProjectsCount} projects. Restoring will overwrite existing data.`);
      }
    } catch {
      // Ignored if engine is clean
    }

    // Verify DB integrity in isolation
    let integrityCheckPassed = false;
    let foreignKeyCheckPassed = false;

    const isolatedDir = join(process.cwd(), ".anantham", ".staging_restore_" + Date.now());
    mkdirSync(isolatedDir, { recursive: true });
    const stagingDbPath = join(isolatedDir, "staging.sqlite");

    try {
      this.extractDbToPath(backupPath, stagingDbPath, manifest, options);
      const stagingEngine = new SqliteEngine({ path: stagingDbPath });
      stagingEngine.open();

      const integ = stagingEngine.integrityCheck();
      integrityCheckPassed = integ.ok;
      if (!integ.ok) {
        errors.push(`Integrity check failed: ${integ.messages.join(", ")}`);
      }

      const fk = stagingEngine.foreignKeyCheck();
      foreignKeyCheckPassed = fk.ok;
      if (!fk.ok) {
        warnings.push(`Foreign key violations detected in staging DB: ${JSON.stringify(fk.violations)}`);
      }

      stagingEngine.close();
    } catch (err: any) {
      errors.push(`Staging extraction error: ${err.message}`);
    } finally {
      try {
        rmSync(isolatedDir, { recursive: true, force: true });
      } catch {}
    }

    return {
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      schemaVersion: manifest.schemaVersion,
      isCompatible,
      counts: manifest.counts,
      conflicts: {
        existingProjectsCount,
        existingSessionsCount,
        existingTasksCount,
        conflictingProjectIds,
        conflictingSessionIds,
      },
      integrityCheckPassed,
      foreignKeyCheckPassed,
      warnings,
      errors,
    };
  }

  private extractDbToPath(backupPath: string, destinationDbPath: string, manifest: BackupManifest, options?: { passphrase?: string; keyBuffer?: Buffer }): void {
    const encPath = join(backupPath, "anantham.sqlite.enc");
    const plainPath = join(backupPath, "anantham.sqlite");

    if (manifest.encryption.enabled) {
      if (!existsSync(encPath)) {
        throw new Error(`Encrypted backup file not found at ${encPath}`);
      }
      if (!manifest.encryption.saltHex || !manifest.encryption.ivHex || !manifest.encryption.tagHex) {
        throw new Error("Missing encryption metadata in manifest.");
      }

      const salt = Buffer.from(manifest.encryption.saltHex, "hex");
      const iv = Buffer.from(manifest.encryption.ivHex, "hex");
      const tag = Buffer.from(manifest.encryption.tagHex, "hex");
      const key = this.deriveKey(options?.passphrase, options?.keyBuffer, salt);

      const encBytes = readFileSync(encPath);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encBytes), decipher.final()]);

      const decryptedSha = createHash("sha256").update(decrypted).digest("hex");
      if (decryptedSha !== manifest.checksums.dbSha256) {
        throw new Error(`Decrypted database checksum mismatch. Expected ${manifest.checksums.dbSha256}, got ${decryptedSha}`);
      }

      writeFileSync(destinationDbPath, decrypted);
    } else {
      if (!existsSync(plainPath)) {
        throw new Error(`Database backup file not found at ${plainPath}`);
      }
      const rawBytes = readFileSync(plainPath);
      const actualSha = createHash("sha256").update(rawBytes).digest("hex");
      if (actualSha !== manifest.checksums.dbSha256) {
        throw new Error(`Database checksum mismatch. Expected ${manifest.checksums.dbSha256}, got ${actualSha}`);
      }
      writeFileSync(destinationDbPath, rawBytes);
    }
  }

  public async restoreBackup(backupPath: string, options?: RestoreOptions): Promise<RestoreResult> {
    const startTime = Date.now();
    const manifest = await this.inspectBackup(backupPath, options);
    const dryRunReport = await this.dryRunRestore(backupPath, options);

    if (dryRunReport.errors.length > 0) {
      throw new Error(`Cannot restore backup: ${dryRunReport.errors.join("; ")}`);
    }

    if (dryRunReport.conflicts.existingProjectsCount > 0 && !options?.force) {
      throw new Error("Target database contains existing records. Explicit force: true option required to overwrite.");
    }

    const targetDb = options?.targetDbPath ?? (this.engine as any).config?.path;
    if (!targetDb || targetDb === ":memory:") {
      // In-memory or custom target
      const stagingDir = join(process.cwd(), ".anantham", ".staging_act_" + Date.now());
      mkdirSync(stagingDir, { recursive: true });
      const tempTarget = join(stagingDir, "restored.sqlite");
      this.extractDbToPath(backupPath, tempTarget, manifest, options);

      // Re-populate live in-memory engine by dumping tables or copying
      const stagingEngine = new SqliteEngine({ path: tempTarget });
      stagingEngine.open();

      this.engine.transaction(() => {
        // Clear existing tables and copy from staging
        const tables = ["projects", "sessions", "tasks", "events", "checkpoints", "artifacts", "attachments", "memory_items"];
        for (const t of tables) {
          try {
            this.engine.raw.exec(`DELETE FROM ${t};`);
          } catch {}
        }
        for (const t of tables) {
          try {
            const rows = stagingEngine.raw.prepare(`SELECT * FROM ${t}`).all() as Record<string, any>[];
            const firstRow = rows[0];
            if (firstRow) {
              const keys = Object.keys(firstRow);
              const cols = keys.join(", ");
              const placeholders = keys.map(() => "?").join(", ");
              const insertStmt = this.engine.raw.prepare(`INSERT INTO ${t} (${cols}) VALUES (${placeholders})`);
              for (const r of rows) {
                insertStmt.run(...keys.map((k) => r[k]));
              }
            }
          } catch {}
        }
      });

      stagingEngine.close();
      rmSync(stagingDir, { recursive: true, force: true });
    } else {
      // File-based database restore
      this.engine.close();
      this.extractDbToPath(backupPath, targetDb, manifest, options);
      this.engine.open();
    }

    return {
      success: true,
      backupId: manifest.backupId,
      restoredAt: new Date().toISOString(),
      restoredCounts: manifest.counts,
      durationMs: Date.now() - startTime,
      report: dryRunReport,
    };
  }

  public async pointInTimeRestore(
    backupPath: string,
    pointInTime: { timestamp?: string; eventId?: string; sequenceOffset?: number },
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    const restoreRes = await this.restoreBackup(backupPath, { ...options, force: true });

    // Filter events after pointInTime
    this.engine.transaction(() => {
      if (pointInTime.timestamp) {
        this.engine.raw.prepare("DELETE FROM events WHERE timestamp > ?").run(pointInTime.timestamp);
      } else if (pointInTime.eventId) {
        const target = this.engine.raw.prepare("SELECT timestamp FROM events WHERE id = ?").get(pointInTime.eventId) as { timestamp: string } | undefined;
        if (target) {
          this.engine.raw.prepare("DELETE FROM events WHERE timestamp > ?").run(target.timestamp);
        }
      } else if (typeof pointInTime.sequenceOffset === "number") {
        const rows = this.engine.raw.prepare("SELECT id FROM events ORDER BY timestamp ASC").all() as { id: string }[];
        if (rows.length > pointInTime.sequenceOffset) {
          const keepIds = new Set(rows.slice(0, pointInTime.sequenceOffset).map((r) => r.id));
          const toDelete = rows.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
          for (const delId of toDelete) {
            this.engine.raw.prepare("DELETE FROM events WHERE id = ?").run(delId);
          }
        }
      }
    });

    return {
      ...restoreRes,
      restoredCounts: this.getEntityCounts(),
    };
  }

  public async listBackups(): Promise<Array<{ backupPath: string; manifest: BackupManifest; sizeBytes: number }>> {
    if (!existsSync(this.backupStorageDir)) {
      return [];
    }

    const entries = readdirSync(this.backupStorageDir);
    const results: Array<{ backupPath: string; manifest: BackupManifest; sizeBytes: number }> = [];

    for (const entry of entries) {
      const fullPath = join(this.backupStorageDir, entry);
      const manifestPath = join(fullPath, "manifest.json");
      if (existsSync(manifestPath)) {
        try {
          const manifest = await this.inspectBackup(fullPath);
          let sizeBytes = 0;
          const files = readdirSync(fullPath);
          for (const f of files) {
            try {
              sizeBytes += statSync(join(fullPath, f)).size;
            } catch {}
          }
          results.push({
            backupPath: fullPath,
            manifest,
            sizeBytes,
          });
        } catch {}
      }
    }

    return results.sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt));
  }
}
