/**
 * Shell Integration Scripts & Prompt Hooks Generator
 * PRD-PART2-212: Shell Integration Scripts & Prompt Hooks
 */

export type SupportedShell = "bash" | "zsh" | "fish" | "powershell";

export class ShellIntegrationGenerator {
  public generateScript(shell: SupportedShell): string {
    switch (shell) {
      case "bash":
        return this.generateBash();
      case "zsh":
        return this.generateZsh();
      case "fish":
        return this.generateFish();
      case "powershell":
        return this.generatePowerShell();
    }
  }

  private generateBash(): string {
    return `# Anantham V2 Shell Integration for Bash
__anantham_preexec() {
    printf "\\033]133;C\\007"
}
__anantham_precmd() {
    local exit_code=$?
    printf "\\033]133;D;%s\\007" "$exit_code"
    printf "\\033]133;A\\007"
}
if [[ -z "$PROMPT_COMMAND" ]]; then
    PROMPT_COMMAND="__anantham_precmd"
else
    PROMPT_COMMAND="__anantham_precmd;$PROMPT_COMMAND"
fi
trap '__anantham_preexec' DEBUG
`;
  }

  private generateZsh(): string {
    return `# Anantham V2 Shell Integration for Zsh
autoload -Uz add-zsh-hook
__anantham_preexec() {
    print -n "\\e]133;C\\a"
}
__anantham_precmd() {
    local exit_code=$?
    print -n "\\e]133;D;$exit_code\\a"
    print -n "\\e]133;A\\a"
}
add-zsh-hook preexec __anantham_preexec
add-zsh-hook precmd __anantham_precmd
`;
  }

  private generateFish(): string {
    return `# Anantham V2 Shell Integration for Fish
function __anantham_preexec --on-event fish_preexec
    printf "\\e]133;C\\a"
end
function __anantham_postexec --on-event fish_postexec
    set -l exit_code $status
    printf "\\e]133;D;%s\\a" "$exit_code"
    printf "\\e]133;A\\a"
end
`;
  }

  private generatePowerShell(): string {
    return `# Anantham V2 Shell Integration for PowerShell
$global:__AnanthamOldPrompt = $function:prompt
function global:prompt {
    $exitCode = $LASTEXITCODE
    [Console]::Write("\x1b]133;D;$exitCode\x07")
    [Console]::Write("\x1b]133;A\x07")
    if ($global:__AnanthamOldPrompt) {
        & $global:__AnanthamOldPrompt
    } else {
        "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) "
    }
}
`;
  }
}
