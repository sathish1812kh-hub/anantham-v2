/**
 * Dangerous Command Heuristics & Blocklist Engine
 * PRD-SEC-005: Dangerous Command Heuristics & Blocklist Engine
 */

export interface DangerousCommandAnalysis {
  isDangerous: boolean;
  severity: "critical" | "high" | "medium" | "safe";
  matchedRule?: string;
  reason?: string;
}

export class DangerousCommandHeuristics {
  private static readonly CRITICAL_PATTERNS = [
    { pattern: /\brm\s+(-rf|-fr|--recursive)\s+(\/|~|\$HOME|\.\.)(?:\s|$|[;&|])/i, rule: "ROOT_OR_HOME_RECURSIVE_DELETE" },
    { pattern: /\b(del|rd|rmdir)\s+\/s\s+\/q\s+[a-z]:\\/i, rule: "WINDOWS_ROOT_RECURSIVE_DELETE" },
    { pattern: /\bformat\s+[a-z]:/i, rule: "DISK_FORMAT" },
    { pattern: /\bmkfs(\.[a-z0-9]+)?\s+/i, rule: "FILESYSTEM_CREATE" },
    { pattern: /\bdd\s+if=.*of=\/dev\/(sd[a-z]|nvme|hd[a-z]|zero)/i, rule: "RAW_DISK_OVERWRITE" },
    { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, rule: "BASH_FORK_BOMB" },
    { pattern: /while\s*\(\$true\)\s*\{\s*start-process\s+/i, rule: "POWERSHELL_FORK_BOMB" },
    { pattern: />\s*\/dev\/(sda|hda|nvme)/i, rule: "DIRECT_DEVICE_REDIRECT" },
  ];

  private static readonly HIGH_PATTERNS = [
    { pattern: /\b(sudo|su\s+-|runas)\b/i, rule: "PRIVILEGE_ESCALATION" },
    { pattern: /\bchmod\s+(-R\s+)?777\b/i, rule: "PERMISSIVE_CHMOD_777" },
    { pattern: /\bcurl\s+.*\s*\|\s*(bash|sh|pwsh|powershell)\b/i, rule: "REMOTE_CODE_EXEC_PIPE" },
    { pattern: /\bwget\s+.*\s*\|\s*(bash|sh|pwsh|powershell)\b/i, rule: "REMOTE_CODE_EXEC_PIPE_WGET" },
    { pattern: /\bpowershell.*(-enc|-encodedcommand)\s+[a-z0-9+/=]{16,}/i, rule: "ENCODED_POWERSHELL_PAYLOAD" },
    { pattern: /\becho\s+[a-z0-9+/=]{20,}\s*\|\s*base64\s+-d\s*\|\s*(sh|bash)/i, rule: "BASE64_OBFUSCATED_SHELL" },
    { pattern: /\bchown\s+-R\s+root\b/i, rule: "ROOT_OWNERSHIP_CHANGE" },
  ];

  private static readonly MEDIUM_PATTERNS = [
    { pattern: /\bgit\s+reset\s+--hard\b/i, rule: "GIT_RESET_HARD" },
    { pattern: /\bgit\s+clean\s+-fdx\b/i, rule: "GIT_CLEAN_FORCE" },
    { pattern: /\bkill\s+-9\s+-1\b/i, rule: "KILL_ALL_PROCESSES" },
  ];

  public analyzeCommand(command: string): DangerousCommandAnalysis {
    const trimmed = command.trim();

    // Check Critical
    for (const rule of DangerousCommandHeuristics.CRITICAL_PATTERNS) {
      if (rule.pattern.test(trimmed)) {
        return {
          isDangerous: true,
          severity: "critical",
          matchedRule: rule.rule,
          reason: `Critical danger detected by heuristic rule: ${rule.rule}`,
        };
      }
    }

    // Check High
    for (const rule of DangerousCommandHeuristics.HIGH_PATTERNS) {
      if (rule.pattern.test(trimmed)) {
        return {
          isDangerous: true,
          severity: "high",
          matchedRule: rule.rule,
          reason: `High risk detected by heuristic rule: ${rule.rule}`,
        };
      }
    }

    // Check Medium
    for (const rule of DangerousCommandHeuristics.MEDIUM_PATTERNS) {
      if (rule.pattern.test(trimmed)) {
        return {
          isDangerous: true,
          severity: "medium",
          matchedRule: rule.rule,
          reason: `Medium risk detected by heuristic rule: ${rule.rule}`,
        };
      }
    }

    return {
      isDangerous: false,
      severity: "safe",
    };
  }
}
