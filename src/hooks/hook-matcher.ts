/**
 * Anantham V2 — Hook Matcher & Deterministic Sorter
 *
 * Matches incoming lifecycle events against registered hooks and provides
 * deterministic priority-based candidate ordering.
 */

import { type HookRecord, type HookTriggerType } from "../domain/hook.js";

export interface HookMatchContext {
  event: HookTriggerType;
  projectId?: string;
  payload?: Record<string, unknown>;
}

export class HookMatcher {
  /**
   * Evaluates and returns all matching, enabled hooks in deterministic priority order.
   */
  public match(hooks: HookRecord[], context: HookMatchContext): HookRecord[] {
    const candidates = hooks.filter((record) => {
      // 1. Must be enabled
      if (record.lifecycleState !== "enabled" || !record.manifest.enabled) {
        return false;
      }

      // 2. Must match event trigger type
      if (record.manifest.event !== context.event) {
        return false;
      }

      // 3. Must match project scope
      if (record.manifest.scope === "project") {
        if (!context.projectId || record.manifest.projectId !== context.projectId) {
          return false;
        }
      }

      // 4. Evaluate optional filters
      if (record.manifest.filter) {
        const filter = record.manifest.filter;
        const payload = context.payload || {};

        if (filter.toolName && payload.toolName !== filter.toolName) {
          return false;
        }

        if (filter.modelProvider && payload.provider !== filter.modelProvider) {
          return false;
        }

        if (filter.pathPattern) {
          const targetPath = (payload.filePath || payload.path || "") as string;
          try {
            const regex = new RegExp(filter.pathPattern);
            if (!regex.test(targetPath)) return false;
          } catch {
            if (!targetPath.includes(filter.pathPattern)) return false;
          }
        }

        if (filter.matchPayload) {
          for (const [key, value] of Object.entries(filter.matchPayload)) {
            if (payload[key] !== value) {
              return false;
            }
          }
        }
      }

      return true;
    });

    // Deterministic Sort: Priority descending, then ID ascending
    return candidates.sort((a, b) => {
      if (b.manifest.priority !== a.manifest.priority) {
        return b.manifest.priority - a.manifest.priority;
      }
      return a.id.localeCompare(b.id);
    });
  }
}
