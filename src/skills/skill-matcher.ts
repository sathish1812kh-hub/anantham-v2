/**
 * Anantham V2 — Skill Relevance Matcher
 *
 * Scores and ranks candidate skills against task prompts and goals.
 */

import { type SkillMetadata } from "../domain/skill.js";

export interface SkillMatchCandidate {
  metadata: SkillMetadata;
  score: number;
  matchedTerms: string[];
}

export class SkillRelevanceMatcher {
  /**
   * Matches and ranks skills against a query/goal.
   */
  public match(
    query: string,
    candidates: SkillMetadata[],
    options?: { minScore?: number; maxResults?: number }
  ): SkillMatchCandidate[] {
    const minScore = options?.minScore || 0.1;
    const maxResults = options?.maxResults || 5;

    const queryTerms = query
      .toLowerCase()
      .split(/[^a-zA-Z0-9_\-]+/)
      .filter((t) => t.length > 2);

    const matches: SkillMatchCandidate[] = [];

    for (const skill of candidates) {
      const skillTerms = new Set<string>();
      for (const t of skill.id.toLowerCase().split(/[^a-zA-Z0-9_\-]+/)) skillTerms.add(t);
      for (const t of skill.name.toLowerCase().split(/[^a-zA-Z0-9_\-]+/)) skillTerms.add(t);
      for (const t of skill.description.toLowerCase().split(/[^a-zA-Z0-9_\-]+/)) skillTerms.add(t);
      for (const tag of skill.tags || []) skillTerms.add(tag.toLowerCase());

      const matched: string[] = [];
      let score = 0;

      for (const term of queryTerms) {
        if (skillTerms.has(term)) {
          matched.push(term);
          // Higher score for matches in ID or name
          if (skill.id.toLowerCase().includes(term) || skill.name.toLowerCase().includes(term)) {
            score += 2.0;
          } else {
            score += 1.0;
          }
        }
      }

      // Normalize score by query term length
      const normalizedScore = queryTerms.length > 0 ? score / queryTerms.length : 0;

      if (normalizedScore >= minScore) {
        matches.push({
          metadata: skill,
          score: normalizedScore,
          matchedTerms: matched,
        });
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
}
