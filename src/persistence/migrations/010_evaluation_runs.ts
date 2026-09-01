import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";


/**
 * Migration 010: Evaluation Runs, Case Results & Benchmarks Persistence
 * PRD Part 3 Section 80–120 / P9.1
 */
export const migration010: Migration = {
  id: 10,
  name: "010_evaluation_runs",
  up(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS eval_runs (
        id TEXT PRIMARY KEY NOT NULL,
        dataset_id TEXT NOT NULL,
        dataset_version TEXT NOT NULL,
        status TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_eval_runs_dataset
        ON eval_runs (dataset_id, dataset_version);

      CREATE TABLE IF NOT EXISTS eval_case_results (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        status TEXT NOT NULL,
        score REAL NOT NULL,
        assertion_results_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        failure_classification TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES eval_runs (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_eval_case_results_run
        ON eval_case_results (run_id);
    `);
  },
};
