import {
  type SideEffectCategory,
  SideEffectCategorySchema,
} from "../domain/side-effect.js";
import { type ToolSpec } from "../domain/tool.js";

/**
 * Anantham V2 — Side Effect Classifier
 * PRD Part 1 Section 83-90 & PRD Part 2 Section 241-248
 */
export class SideEffectClassifier {
  private static readonly KNOWN_READ_ONLY_TOOLS = new Set([
    "read_file",
    "search_text",
    "find_files",
    "list_dir",
    "file_stat",
    "git_status",
    "git_diff",
    "git_log",
    "worktree_list",
    "read_artifact",
    "retrieve_memory",
  ]);

  private static readonly KNOWN_IDEMPOTENT_WRITE_TOOLS = new Set([
    "write_file",
    "save_artifact",
    "store_memory",
  ]);

  private static readonly KNOWN_REVERSIBLE_WRITE_TOOLS = new Set([
    "worktree_add",
  ]);

  private static readonly KNOWN_NON_IDEMPOTENT_TOOLS = new Set([
    "git_commit",
    "run_command",
    "delete_file",
    "worktree_remove",
  ]);

  public classify(
    toolName: string,
    args: Record<string, unknown> = {},
    toolSpec?: ToolSpec
  ): SideEffectCategory {
    // 1. Check toolSpec explicit flag if available
    if (toolSpec?.isIdempotent && !SideEffectClassifier.KNOWN_READ_ONLY_TOOLS.has(toolName)) {
      return "idempotent_write";
    }

    // 2. Special handling for HTTP/network tools
    if (toolName === "fetch_url") {
      const method = String(args.method || "GET").toUpperCase();
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        return "read_only";
      }
      if (method === "PUT" || method === "DELETE") {
        return "idempotent_write";
      }
      return "non_idempotent_write";
    }

    // 3. Known classifications
    if (SideEffectClassifier.KNOWN_READ_ONLY_TOOLS.has(toolName)) {
      return "read_only";
    }

    if (SideEffectClassifier.KNOWN_IDEMPOTENT_WRITE_TOOLS.has(toolName)) {
      return "idempotent_write";
    }

    if (SideEffectClassifier.KNOWN_REVERSIBLE_WRITE_TOOLS.has(toolName)) {
      return "reversible_write";
    }

    if (SideEffectClassifier.KNOWN_NON_IDEMPOTENT_TOOLS.has(toolName)) {
      return "non_idempotent_write";
    }

    // 4. Default fallback: fail-safe to "unknown"
    return "unknown";
  }

  public isSafeToRetry(category: SideEffectCategory): boolean {
    const validated = SideEffectCategorySchema.parse(category);
    return validated === "read_only" || validated === "idempotent_write";
  }
}
