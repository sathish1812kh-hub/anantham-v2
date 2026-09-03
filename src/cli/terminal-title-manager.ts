/**
 * Dynamic Terminal Title & OSC Progress Manager
 * PRD-PART2-214: Terminal Title Dynamic Updates & Progress Reporting
 */

export class TerminalTitleManager {
  private currentTitle = "";
  private progressPercent: number | null = null;

  public formatTitleEscape(title: string): string {
    this.currentTitle = title;
    return `\x1b]0;${title}\x07`;
  }

  public formatProgressEscape(state: "normal" | "error" | "indeterminate" | "clear", percent?: number): string {
    // OSC 9;4 ConEmu / Windows Terminal progress protocol
    switch (state) {
      case "normal": {
        const p = Math.max(0, Math.min(100, percent ?? 0));
        this.progressPercent = p;
        return `\x1b]9;4;1;${p}\x07`;
      }
      case "error":
        return `\x1b]9;4;2;100\x07`;
      case "indeterminate":
        return `\x1b]9;4;3;0\x07`;
      case "clear":
      default:
        this.progressPercent = null;
        return `\x1b]9;4;0;0\x07`;
    }
  }

  public getTitle(): string {
    return this.currentTitle;
  }

  public getProgress(): number | null {
    return this.progressPercent;
  }
}
