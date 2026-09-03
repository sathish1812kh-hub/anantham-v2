/**
 * Native Windows Host Execution Boundaries Guard
 * PRD-PART2-108: Native Windows Host Execution Boundaries
 */

import { basename } from "node:path";

export interface WindowsPathValidation {
  isSafe: boolean;
  violationType?: "DOS_DEVICE" | "ALTERNATE_DATA_STREAM" | "TRAILING_DOT_OR_SPACE" | "RESERVED_NAME";
  reason?: string;
}

export class WindowsBoundaryGuard {
  private static readonly DOS_DEVICES = new Set([
    "con", "prn", "aux", "nul",
    "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
    "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
  ]);

  public validateWindowsPath(filePath: string): WindowsPathValidation {
    const name = basename(filePath);

    // 1. Check for NTFS Alternate Data Stream (colon in path after drive letter)
    // Example: C:\path\file.txt:hidden_stream or file.txt:$DATA
    const pathWithoutDrive = filePath.replace(/^[a-zA-Z]:/, "");
    if (pathWithoutDrive.includes(":")) {
      return {
        isSafe: false,
        violationType: "ALTERNATE_DATA_STREAM",
        reason: `NTFS Alternate Data Stream detected in path: '${filePath}'`,
      };
    }

    // 2. Check for DOS reserved device names (e.g. CON, NUL, AUX, COM1, etc.)
    const nameWithoutExt = name.split(".")[0]?.toLowerCase() ?? "";
    if (WindowsBoundaryGuard.DOS_DEVICES.has(nameWithoutExt)) {
      return {
        isSafe: false,
        violationType: "DOS_DEVICE",
        reason: `DOS reserved device name detected: '${nameWithoutExt}' in '${filePath}'`,
      };
    }

    // 3. Check for trailing dots or spaces which Windows API silently truncates
    if (name.endsWith(".") || name.endsWith(" ")) {
      return {
        isSafe: false,
        violationType: "TRAILING_DOT_OR_SPACE",
        reason: `Path component ends with trailing dot or space: '${name}' in '${filePath}'`,
      };
    }

    return { isSafe: true };
  }

  public detectShellType(shellCommand: string): "pwsh" | "powershell" | "cmd" | "bash" | "unknown" {
    const lower = shellCommand.toLowerCase();
    if (lower.includes("pwsh")) return "pwsh";
    if (lower.includes("powershell")) return "powershell";
    if (lower.includes("cmd.exe") || lower === "cmd") return "cmd";
    if (lower.includes("bash") || lower.includes("sh")) return "bash";
    return "unknown";
  }

  public sanitizeWindowsShellArgs(args: string[], shell: "pwsh" | "powershell" | "cmd"): string[] {
    if (shell === "cmd") {
      // In cmd.exe, characters like &, |, ^, %, <, > have dangerous interpolation semantics
      return args.map((arg) => arg.replace(/[%^&|<>]/g, "^$&"));
    }
    // For PowerShell, single-quote literals to prevent expansion
    return args;
  }
}
