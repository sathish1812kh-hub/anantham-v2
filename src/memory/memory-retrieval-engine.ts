import type { SqliteEngine } from "../persistence/sqlite-engine.js";
import { MemoryRepository } from "../persistence/repositories/memory-repository.js";
import type { CandidateContextItem } from "../context/context-engine.js";
import type { MemoryPriority } from "../domain/memory.js";
import type { SensitivityLevel } from "../domain/security.js";
import {
  MemorySearchQuerySchema,
  MemorySearchResultSchema,
  type MemorySearchQuery,
  type MemorySearchResult,
} from "./memory-types.js";

const PRIORITY_WEIGHTS: Record<MemoryPriority, number> = {
  CRITICAL: 1.0,
  HIGH: 0.75,
  NORMAL: 0.5,
  LOW: 0.25,
};

export class MemoryRetrievalEngine {
  private readonly engine: SqliteEngine;
  private readonly memoryRepo: MemoryRepository;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
    this.memoryRepo = new MemoryRepository(engine);
  }

  /**
   * Performs deterministic, scoped search across memory items using SQLite FTS5.
   * Enforces strict Project boundary isolation and sensitivity controls.
   * PRD Part 1 Section 64 & PRD Part 3 Section 139.
   */
  public async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    const validatedQuery = MemorySearchQuerySchema.parse(query);

    // Sanitize query for FTS5 syntax
    const cleanTokens = validatedQuery.query
      .replace(/["*^\-:]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (cleanTokens.length === 0) {
      return [];
    }

    const ftsQuery = cleanTokens.map((t) => `"${t}"*`).join(" OR ");

    // Query FTS5 table joined with scope conditions
    let sql = `
      SELECT fts.id, bm25(memory_fts) AS bm25_rank, snippet(memory_fts, 1, '<b>', '</b>', '...', 16) AS match_snippet
      FROM memory_fts fts
      WHERE memory_fts MATCH ?
    `;
    const params: (string | number)[] = [ftsQuery];

    // Project boundary enforcement (INVARIANT 1)
    sql += ` AND (fts.project_id = ? OR fts.scope = 'global')`;
    params.push(validatedQuery.projectId);

    if (validatedQuery.sessionId) {
      sql += ` AND (fts.session_id = ? OR fts.session_id IS NULL)`;
      params.push(validatedQuery.sessionId);
    }

    if (validatedQuery.scope) {
      sql += ` AND fts.scope = ?`;
      params.push(validatedQuery.scope);
    }

    if (validatedQuery.type) {
      sql += ` AND fts.type = ?`;
      params.push(validatedQuery.type);
    }

    sql += ` LIMIT ?;`;
    params.push(validatedQuery.limit * 2); // Over-fetch for confidence & sensitivity filtering

    let rows: Array<{ id: string; bm25_rank: number; match_snippet: string }> = [];
    try {
      const stmt = this.engine.raw.prepare(sql);
      rows = stmt.all(...params) as Array<{ id: string; bm25_rank: number; match_snippet: string }>;
    } catch {
      // Fallback: if FTS MATCH syntax fails on atypical characters, perform LIKE query
      const fallbackSql = `
        SELECT id, 0.5 AS bm25_rank, content AS match_snippet
        FROM memory_items
        WHERE (project_id = ? OR scope = 'global')
          AND content LIKE ?
        LIMIT ?;
      `;
      const fallbackStmt = this.engine.raw.prepare(fallbackSql);
      rows = fallbackStmt.all(
        validatedQuery.projectId,
        `%${validatedQuery.query}%`,
        validatedQuery.limit
      ) as Array<{ id: string; bm25_rank: number; match_snippet: string }>;
    }

    const results: MemorySearchResult[] = [];

    for (const row of rows) {
      const item = this.memoryRepo.findById(row.id);
      if (!item) continue;

      // Filter by confidence
      if (item.confidence < validatedQuery.minConfidence) continue;

      // Filter by max sensitivity if requested
      if (validatedQuery.maxSensitivity) {
        const sensitivityRank: Record<SensitivityLevel, number> = {
          public: 0,
          normal: 1,
          sensitive: 2,
          secret: 3,
        };
        if (sensitivityRank[item.sensitivity] > sensitivityRank[validatedQuery.maxSensitivity]) {
          continue; // Exclude overly sensitive item
        }
      }

      // Compute deterministic composite score:
      // BM25 rank is negative/lower is better in SQLite bm25(), so normalize score:
      const lexicalScore = Math.max(0, 1 / (1 + Math.abs(row.bm25_rank)));
      const priorityScore = PRIORITY_WEIGHTS[item.priority] || 0.5;
      const compositeScore = lexicalScore * 0.5 + item.confidence * 0.3 + priorityScore * 0.2;

      results.push({
        item,
        score: Number(compositeScore.toFixed(4)),
        matchSnippet: row.match_snippet,
        matchReasons: [
          `FTS5 matched token(s) with lexical score ${lexicalScore.toFixed(2)}`,
          `Confidence weight ${item.confidence.toFixed(2)}`,
          `Priority ${item.priority}`,
        ],
      });
    }

    // Sort by score descending, then recency, with deterministic ID tie-breaking
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.item.createdAt !== a.item.createdAt) {
        return b.item.createdAt.localeCompare(a.item.createdAt);
      }
      return a.item.id.localeCompare(b.item.id);
    });

    return results.slice(0, validatedQuery.limit).map((r) => MemorySearchResultSchema.parse(r));
  }

  /**
   * Transforms MemorySearchResult items into CandidateContextItem objects for ContextEngine.
   * INVARIANT 3 & 4: Memory is data, not policy. Retains untrusted authority.
   */
  public asCandidateContextItems(results: MemorySearchResult[]): CandidateContextItem[] {
    return results.map((res) => {
      const item = res.item;
      return {
        id: `ctx_mem_${item.id}`,
        sourceType: "memory",
        sourceId: item.id,
        rawContent: `[MEMORY: ${item.type} | Scope: ${item.scope}]\n${item.content}`,
        priority: item.priority,
        authority: item.scope === "project" ? "project-instruction" : "agent",
        projectId: item.projectId,
        selectedBecause: `Retrieved via FTS query (Score: ${res.score})`,
        metadata: {
          confidence: item.confidence,
          sensitivity: item.sensitivity,
          score: res.score,
          tags: item.tags,
        },
      };
    });
  }
}
