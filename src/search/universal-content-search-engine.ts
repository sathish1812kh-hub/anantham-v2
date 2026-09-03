import { z } from "zod";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { EventStore } from "../event-state/event-store.js";
import { MemoryRepository } from "../persistence/repositories/memory-repository.js";
import { SensitivityLevelSchema, type SensitivityLevel } from "../domain/security.js";

export const ContentModalitySchema = z.enum([
  "code",
  "document",
  "transcript",
  "memory",
  "artifact",
  "event",
]);
export type ContentModality = z.infer<typeof ContentModalitySchema>;

export const UnifiedSearchQuerySchema = z.object({
  query: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  modalities: z.array(ContentModalitySchema).optional(),
  timeRange: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
  sensitivityCap: SensitivityLevelSchema.default("secret"),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
});
export type UnifiedSearchQuery = z.infer<typeof UnifiedSearchQuerySchema>;

export const SearchResultItemSchema = z.object({
  id: z.string().min(1),
  modality: ContentModalitySchema,
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  title: z.string().min(1),
  snippet: z.string().min(1),
  uri: z.string().optional(),
  relevanceScore: z.number().min(0).max(1),
  sensitivity: SensitivityLevelSchema,
  timestamp: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const UnifiedSearchResultSchema = z.object({
  query: z.string(),
  totalHits: z.number().int().nonnegative(),
  results: z.array(SearchResultItemSchema),
  modalitiesSearched: z.array(ContentModalitySchema),
  durationMs: z.number().nonnegative(),
});
export type UnifiedSearchResult = z.infer<typeof UnifiedSearchResultSchema>;

const SENSITIVITY_RANK: Record<SensitivityLevel, number> = {
  public: 0,
  normal: 1,
  sensitive: 2,
  secret: 3,
};

export interface UniversalContentSearchEngineOptions {
  engine: SqliteEngine;
  eventStore?: EventStore;
  memoryRepo?: MemoryRepository;
}

export class UniversalContentSearchEngine {
  private readonly engine: SqliteEngine;
    
  constructor(options: UniversalContentSearchEngineOptions) {
    this.engine = options.engine;
          }

  private computeScore(query: string, text: string): number {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (t === q) return 1.0;
    if (t.startsWith(q)) return 0.9;
    if (t.includes(q)) return 0.75;

    const terms = q.split(/\s+/).filter((w) => w.length > 2);
    if (terms.length === 0) return 0.5;
    let matched = 0;
    for (const term of terms) {
      if (t.includes(term)) matched++;
    }
    return 0.3 + 0.4 * (matched / terms.length);
  }

  private makeSnippet(query: string, text: string, maxLen: number = 160): string {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) {
      return text.slice(0, maxLen) + (text.length > maxLen ? "..." : "");
    }
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + query.length + 80);
    let snippet = text.slice(start, end).trim();
    if (start > 0) snippet = "..." + snippet;
    if (end < text.length) snippet = snippet + "...";
    return snippet;
  }

  public async searchMemories(
    projectId: string,
    term: string,
    maxSensitivity: SensitivityLevel = "secret"
  ): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];
    try {
      const sql = `
        SELECT * FROM memory_items
        WHERE (project_id = ? OR project_id IS NULL)
          AND (LOWER(content) LIKE ? OR LOWER(type) LIKE ? OR LOWER(tags_json) LIKE ?)
        ORDER BY confidence DESC
        LIMIT 50;
      `;
      const pattern = "%" + term.toLowerCase() + "%";
      const rows = this.engine.raw.prepare(sql).all(projectId, pattern, pattern, pattern) as any[];

      const capRank = SENSITIVITY_RANK[maxSensitivity as SensitivityLevel] ?? 3;

      for (const r of rows) {
        const sens = (r.sensitivity as SensitivityLevel) || "normal";
        if (SENSITIVITY_RANK[sens] > capRank) continue;

        const score = this.computeScore(term, r.content);
        results.push({
          id: r.id,
          modality: "memory",
          projectId: r.project_id || projectId,
          sessionId: r.session_id || undefined,
          title: "Memory: " + r.type,
          snippet: this.makeSnippet(term, r.content),
          relevanceScore: score,
          sensitivity: sens,
          timestamp: r.created_at,
          metadata: { confidence: r.confidence, priority: r.priority },
        });
      }
    } catch {}
    return results;
  }

  public async searchEvents(
    projectId: string,
    term: string
  ): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];
    try {
      const sql = `
        SELECT * FROM events
        WHERE project_id = ?
          AND (LOWER(type) LIKE ? OR LOWER(actor) LIKE ? OR LOWER(payload_json) LIKE ?)
        ORDER BY timestamp DESC
        LIMIT 50;
      `;
      const pattern = "%" + term.toLowerCase() + "%";
      const rows = this.engine.raw.prepare(sql).all(projectId, pattern, pattern, pattern) as any[];

      for (const r of rows) {
        const text = r.type + " " + r.actor + " " + r.payload_json;
        const score = this.computeScore(term, text);
        results.push({
          id: r.id,
          modality: "event",
          projectId: r.project_id,
          sessionId: r.session_id || undefined,
          title: "Event: " + r.type,
          snippet: this.makeSnippet(term, text),
          relevanceScore: score,
          sensitivity: "normal",
          timestamp: r.timestamp,
        });
      }
    } catch {}
    return results;
  }

  public async searchArtifacts(
    projectId: string,
    term: string
  ): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];
    try {
      const sql = `
        SELECT * FROM artifacts
        WHERE project_id = ?
          AND (LOWER(type) LIKE ? OR LOWER(content_uri) LIKE ? OR LOWER(metadata_json) LIKE ?)
        ORDER BY created_at DESC
        LIMIT 50;
      `;
      const pattern = "%" + term.toLowerCase() + "%";
      const rows = this.engine.raw.prepare(sql).all(projectId, pattern, pattern, pattern) as any[];

      for (const r of rows) {
        let title = r.type;
        if (r.metadata_json) {
          try {
            const meta = JSON.parse(r.metadata_json);
            if (meta.title) title = meta.title;
          } catch {}
        }

        const text = r.type + " " + r.content_uri + " " + (r.metadata_json || "");
        const score = this.computeScore(term, text);
        results.push({
          id: r.id,
          modality: "artifact",
          projectId: r.project_id,
          sessionId: r.session_id || undefined,
          title: "Artifact: " + title,
          snippet: this.makeSnippet(term, text),
          uri: r.content_uri,
          relevanceScore: score,
          sensitivity: "normal",
          timestamp: r.created_at,
        });
      }
    } catch {}
    return results;
  }

  public async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult> {
    const start = Date.now();
    const validated = UnifiedSearchQuerySchema.parse(query);

    const modalities = validated.modalities ?? ["memory", "event", "artifact"];
    const allResults: SearchResultItem[] = [];

    if (modalities.includes("memory")) {
      const mems = await this.searchMemories(validated.projectId, validated.query, validated.sensitivityCap);
      allResults.push(...mems);
    }
    if (modalities.includes("event")) {
      const evts = await this.searchEvents(validated.projectId, validated.query);
      allResults.push(...evts);
    }
    if (modalities.includes("artifact")) {
      const arts = await this.searchArtifacts(validated.projectId, validated.query);
      allResults.push(...arts);
    }

    // Time filter
    let filtered = allResults;
    if (validated.timeRange) {
      if (validated.timeRange.from) {
        const fromMs = new Date(validated.timeRange.from).getTime();
        filtered = filtered.filter((r) => new Date(r.timestamp).getTime() >= fromMs);
      }
      if (validated.timeRange.to) {
        const toMs = new Date(validated.timeRange.to).getTime();
        filtered = filtered.filter((r) => new Date(r.timestamp).getTime() <= toMs);
      }
    }

    // Sort by relevance score descending, then timestamp descending
    filtered.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const paginated = filtered.slice(validated.offset, validated.offset + validated.limit);

    return {
      query: validated.query,
      totalHits: filtered.length,
      results: paginated,
      modalitiesSearched: modalities,
      durationMs: Date.now() - start,
    };
  }
}
