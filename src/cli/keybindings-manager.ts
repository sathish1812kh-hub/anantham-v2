/**
 * Keyboard Shortcuts & Keybindings System
 * PRD-CLI-004: Keyboard Shortcuts & Keybinding System
 */

export type KeyAction =
  | "cancel_execution"
  | "exit_repl"
  | "clear_screen"
  | "history_up"
  | "history_down"
  | "autocomplete"
  | "submit_input"
  | "toggle_multiline";

export interface KeyShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: KeyAction;
  description: string;
}

export class KeybindingsManager {
  private bindings: Map<string, KeyShortcut> = new Map();

  constructor() {
    this.registerDefaults();
  }

  public registerShortcut(shortcut: KeyShortcut): void {
    const keyCombo = this.computeKeyId(shortcut);
    this.bindings.set(keyCombo, shortcut);
  }

  public resolveAction(key: string, modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): KeyAction | null {
    const keyCombo = this.computeKeyId({ key, ...modifiers });
    const match = this.bindings.get(keyCombo);
    return match ? match.action : null;
  }

  public listKeybindings(): KeyShortcut[] {
    return Array.from(this.bindings.values());
  }

  private computeKeyId(s: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }): string {
    const parts: string[] = [];
    if (s.ctrl) parts.push("Ctrl");
    if (s.alt) parts.push("Alt");
    if (s.shift) parts.push("Shift");
    parts.push(s.key.toUpperCase());
    return parts.join("+");
  }

  private registerDefaults(): void {
    this.registerShortcut({ key: "c", ctrl: true, action: "cancel_execution", description: "Interrupt current process" });
    this.registerShortcut({ key: "d", ctrl: true, action: "exit_repl", description: "Exit Anantham shell" });
    this.registerShortcut({ key: "l", ctrl: true, action: "clear_screen", description: "Clear terminal screen" });
    this.registerShortcut({ key: "up", action: "history_up", description: "Previous history entry" });
    this.registerShortcut({ key: "down", action: "history_down", description: "Next history entry" });
    this.registerShortcut({ key: "tab", action: "autocomplete", description: "Trigger autocomplete" });
    this.registerShortcut({ key: "enter", action: "submit_input", description: "Submit command or prompt" });
  }
}
