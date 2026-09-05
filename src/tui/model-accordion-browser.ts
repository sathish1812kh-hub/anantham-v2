import { type CachedModel } from "../persistence/model-catalog-cache.js";
import { TuiSanitizer } from "./tui-sanitizer.js";
import { AnsiGradient } from "./ansi-gradient.js";

export interface ProviderGroup {
  provider: string;
  displayName: string;
  expanded: boolean;
  models: CachedModel[];
}

export interface AccordionFolderRow {
  type: "provider";
  provider: string;
  displayName: string;
  count: number;
  expanded: boolean;
  groupIndex: number;
}

export interface AccordionModelRow {
  type: "model";
  model: CachedModel;
  groupIndex: number;
  modelIndex: number;
  isLastInGroup: boolean;
}

export type AccordionRow = AccordionFolderRow | AccordionModelRow;

export interface KeyResult {
  action: "none" | "select" | "close" | "render";
  selectedModelId?: string;
}

/**
 * Standard provider display names and ranking order.
 */
const PROVIDER_METADATA: Record<string, { displayName: string; order: number }> = {
  anthropic: { displayName: "Anthropic", order: 1 },
  openai: { displayName: "OpenAI", order: 2 },
  google: { displayName: "Google", order: 3 },
  deepseek: { displayName: "DeepSeek", order: 4 },
  "meta-llama": { displayName: "Meta / Llama", order: 5 },
  virtuals: { displayName: "Virtuals", order: 6 },
  mistralai: { displayName: "Mistral AI", order: 7 },
  qwen: { displayName: "Qwen", order: 8 },
  cohere: { displayName: "Cohere", order: 9 },
};

/**
 * Format context length into readable badge (e.g. "128k ctx", "1M ctx").
 */
export function formatContextLength(ctx: number): string {
  if (ctx >= 1_000_000) {
    const m = ctx / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M ctx`;
  }
  if (ctx >= 1_000) {
    const k = Math.round(ctx / 1000);
    return `${k}k ctx`;
  }
  return `${ctx} ctx`;
}

/**
 * Format prompt/completion price into compact cost badge.
 */
export function formatPricing(promptPerM: number, completionPerM: number): string {
  if (promptPerM === 0 && completionPerM === 0) {
    return "Free";
  }
  const fmt = (n: number): string => {
    if (n === 0) return "0";
    if (n >= 10) return n.toFixed(1);
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(3);
  };
  return `$${fmt(promptPerM)}/$${fmt(completionPerM)} per M`;
}

/**
 * Interactive Accordion Model Browser for terminal agent harness.
 * Styled in Antigravity palette (#0A0A0C, neon cyan #00F2FE, neon violet #7209B7).
 */
export class ModelAccordionBrowser {
  private groups: ProviderGroup[] = [];
  private activeModelId?: string;
  private selectedIndex = 0;
  private scrollOffset = 0;
  private searchQuery = "";
  private isSearching = false;

  public constructor(models: CachedModel[], activeModelId?: string) {
    this.activeModelId = activeModelId;
    this.buildGroups(models);
    this.initializeSelection();
  }

  /**
   * Partitions models into ordered provider groups.
   */
  private buildGroups(models: CachedModel[]): void {
    const groupMap = new Map<string, CachedModel[]>();

    for (const m of models) {
      const prov = m.provider || "other";
      if (!groupMap.has(prov)) {
        groupMap.set(prov, []);
      }
      groupMap.get(prov)!.push(m);
    }

    const unsortedGroups: ProviderGroup[] = [];
    for (const [provider, provModels] of groupMap.entries()) {
      const meta = PROVIDER_METADATA[provider];
      const displayName =
        meta?.displayName ||
        provider.charAt(0).toUpperCase() + provider.slice(1).replace(/-/g, " ");

      // Expand group if it contains the active model, or if it's the first group
      const containsActive = !!(
        this.activeModelId && provModels.some((m) => m.id === this.activeModelId)
      );

      unsortedGroups.push({
        provider,
        displayName,
        expanded: containsActive,
        models: provModels,
      });
    }

    // Sort groups according to defined order, then alphabetically
    unsortedGroups.sort((a, b) => {
      const orderA = PROVIDER_METADATA[a.provider]?.order ?? 99;
      const orderB = PROVIDER_METADATA[b.provider]?.order ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.displayName.localeCompare(b.displayName);
    });

    // If no group had the active model, expand the first group by default
    if (unsortedGroups.length > 0 && !unsortedGroups.some((g) => g.expanded)) {
      const first = unsortedGroups[0];
      if (first) {
        first.expanded = true;
      }
    }

    this.groups = unsortedGroups;
  }

  /**
   * Positions cursor on active model if present.
   */
  private initializeSelection(): void {
    const rows = this.getVisibleRows();
    if (this.activeModelId) {
      const activeIdx = rows.findIndex(
        (r) => r.type === "model" && r.model.id === this.activeModelId
      );
      if (activeIdx >= 0) {
        this.selectedIndex = activeIdx;
        return;
      }
    }
    this.selectedIndex = 0;
  }

  public getActiveModel(): string | undefined {
    return this.activeModelId;
  }

  public setActiveModel(modelId: string): void {
    this.activeModelId = modelId;
  }

  public getProviderGroups(): ProviderGroup[] {
    return this.groups;
  }

  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  public setSelectedIndex(index: number): void {
    const rows = this.getVisibleRows();
    this.selectedIndex = Math.max(0, Math.min(index, rows.length - 1));
  }

  public getSearchFilter(): string {
    return this.searchQuery;
  }

  public setSearchFilter(query: string): void {
    this.searchQuery = query;
    this.clampSelection();
  }

  public toggleExpand(provider: string): void {
    const g = this.groups.find((grp) => grp.provider === provider);
    if (g) {
      g.expanded = !g.expanded;
      this.clampSelection();
    }
  }

  public expandAll(): void {
    for (const g of this.groups) {
      g.expanded = true;
    }
    this.clampSelection();
  }

  public collapseAll(): void {
    for (const g of this.groups) {
      g.expanded = false;
    }
    this.clampSelection();
  }

  private clampSelection(): void {
    const rows = this.getVisibleRows();
    if (rows.length === 0) {
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      return;
    }
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, rows.length - 1));
  }

  /**
   * Flattens visible provider folders and model rows based on expansion state and filter.
   */
  public getVisibleRows(): AccordionRow[] {
    const query = this.searchQuery.trim().toLowerCase();
    const rows: AccordionRow[] = [];

    for (let gIdx = 0; gIdx < this.groups.length; gIdx++) {
      const group = this.groups[gIdx];
      if (!group) continue;
      let models = group.models;

      if (query.length > 0) {
        models = models.filter(
          (m) =>
            m.id.toLowerCase().includes(query) ||
            m.name.toLowerCase().includes(query) ||
            group.displayName.toLowerCase().includes(query) ||
            (m.description && m.description.toLowerCase().includes(query))
        );
        if (models.length === 0) {
          continue;
        }
      }

      // Auto-expand all matching groups when searching
      const isExpanded = query.length > 0 ? true : group.expanded;

      rows.push({
        type: "provider",
        provider: group.provider,
        displayName: group.displayName,
        count: models.length,
        expanded: isExpanded,
        groupIndex: gIdx,
      });

      if (isExpanded) {
        for (let mIdx = 0; mIdx < models.length; mIdx++) {
          const m = models[mIdx];
          if (!m) continue;
          rows.push({
            type: "model",
            model: m,
            groupIndex: gIdx,
            modelIndex: mIdx,
            isLastInGroup: mIdx === models.length - 1,
          });
        }
      }
    }

    return rows;
  }

  /**
   * Processes keyboard events for navigation, expansion, selection, and search.
   */
  public handleKey(token: string): KeyResult {
    // 1. Escape: Close modal or exit search mode
    if (token === "\x1b" || token === "\u001B" || token.toLowerCase() === "escape") {
      if (this.isSearching) {
        this.isSearching = false;
        this.searchQuery = "";
        this.clampSelection();
        return { action: "render" };
      }
      return { action: "close" };
    }

    // 2. Search activation via '/'
    if (!this.isSearching && token === "/") {
      this.isSearching = true;
      return { action: "render" };
    }

    // 3. Search text input handling
    if (this.isSearching) {
      if (token === "\r" || token === "\n" || token.toLowerCase() === "enter") {
        this.isSearching = false;
        return { action: "render" };
      }
      if (token === "\x7f" || token === "\b" || token.toLowerCase() === "backspace") {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.clampSelection();
        return { action: "render" };
      }
      if (token.length === 1 && token >= " ") {
        this.searchQuery += token;
        this.clampSelection();
        return { action: "render" };
      }
    }

    // 4. Up navigation
    if (
      token === "\x1b[A" ||
      token.toLowerCase() === "up" ||
      token === "k" ||
      token === "\x1bOA"
    ) {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
      }
      return { action: "render" };
    }

    // 5. Down navigation
    if (
      token === "\x1b[B" ||
      token.toLowerCase() === "down" ||
      token === "j" ||
      token === "\x1bOB"
    ) {
      const rows = this.getVisibleRows();
      if (this.selectedIndex < rows.length - 1) {
        this.selectedIndex++;
      }
      return { action: "render" };
    }

    // 6. Space: Toggle expansion on folder, or select model
    if (token === " ") {
      const rows = this.getVisibleRows();
      const row = rows[this.selectedIndex];
      if (row && row.type === "provider") {
        const group = this.groups[row.groupIndex];
        if (group) {
          group.expanded = !group.expanded;
          this.clampSelection();
        }
        return { action: "render" };
      }
      if (row && row.type === "model") {
        this.activeModelId = row.model.id;
        return { action: "select", selectedModelId: row.model.id };
      }
      return { action: "render" };
    }

    // 7. Right / Expand / Child jump
    if (
      token === "\x1b[C" ||
      token.toLowerCase() === "right" ||
      token === "l" ||
      token === "\x1bOC"
    ) {
      const rows = this.getVisibleRows();
      const row = rows[this.selectedIndex];
      if (row && row.type === "provider") {
        const group = this.groups[row.groupIndex];
        if (group) {
          if (!group.expanded) {
            group.expanded = true;
          } else if (group.models.length > 0) {
            this.selectedIndex = Math.min(rows.length - 1, this.selectedIndex + 1);
          }
          this.clampSelection();
        }
        return { action: "render" };
      }
      return { action: "render" };
    }

    // 8. Left / Collapse / Parent jump
    if (
      token === "\x1b[D" ||
      token.toLowerCase() === "left" ||
      token === "h" ||
      token === "\x1bOD"
    ) {
      const rows = this.getVisibleRows();
      const row = rows[this.selectedIndex];
      if (row && row.type === "provider") {
        const group = this.groups[row.groupIndex];
        if (group) {
          group.expanded = false;
          this.clampSelection();
        }
        return { action: "render" };
      }
      if (row && row.type === "model") {
        // Jump selection up to parent provider folder
        const parentIdx = rows.findIndex(
          (r) => r.type === "provider" && r.groupIndex === row.groupIndex
        );
        if (parentIdx >= 0) {
          this.selectedIndex = parentIdx;
        }
        return { action: "render" };
      }
      return { action: "render" };
    }

    // 9. Enter: Toggle expansion on folder, or select model
    if (token === "\r" || token === "\n" || token.toLowerCase() === "enter") {
      const rows = this.getVisibleRows();
      const row = rows[this.selectedIndex];
      if (row && row.type === "provider") {
        const group = this.groups[row.groupIndex];
        if (group) {
          group.expanded = !group.expanded;
          this.clampSelection();
        }
        return { action: "render" };
      }
      if (row && row.type === "model") {
        this.activeModelId = row.model.id;
        return { action: "select", selectedModelId: row.model.id };
      }
      return { action: "none" };
    }

    return { action: "none" };
  }

  /**
   * Renders the accordion tree view inside an Antigravity neon frame.
   */
  public render(width: number = 84, maxHeight: number = 22): string[] {
    const lines: string[] = [];
    const innerWidth = Math.max(50, width - 4);

    const borderCyan = "\x1b[38;2;0;242;254m";
    const borderDim = "\x1b[38;2;60;60;80m";
    const reset = "\x1b[0m";

    // 1. Title bar
    const titleText = " ❖ OPENROUTER MODEL EXPLORER ";
    const titleGrad = AnsiGradient.linearGradient(
      titleText,
      AnsiGradient.PALETTES.cyanBlue[0],
      AnsiGradient.PALETTES.cyanBlue[1]
    );
    const topPad = Math.max(0, innerWidth - titleText.length - 2);
    lines.push(`${borderCyan}╭─${reset}${titleGrad}${borderCyan}${"─".repeat(topPad)}╮${reset}`);

    // 2. Info & filter status header line
    const totalModels = this.groups.reduce((acc, g) => acc + g.models.length, 0);
    const countPill = `\x1b[48;2;16;38;56m\x1b[38;2;0;242;254m [${totalModels} Models] ${reset}`;
    const activeLabel = this.activeModelId
      ? `\x1b[90mActive: \x1b[38;2;79;172;254m${this.activeModelId.split("/").pop()}${reset}`
      : `\x1b[90mActive: \x1b[38;2;120;140;180m(none)${reset}`;

    const searchStr = this.searchQuery
      ? `\x1b[90mFilter: \x1b[38;2;255;215;0m/${this.searchQuery}${this.isSearching ? "█" : ""}${reset}`
      : this.isSearching
        ? `\x1b[90mFilter: \x1b[38;2;255;215;0m/█${reset}`
        : `\x1b[90mFilter: [/] Search${reset}`;

    const headerLeft = ` ${countPill}  ${activeLabel}`;
    const headerRight = `${searchStr} `;
    const headerLeftClean = TuiSanitizer.sanitize(headerLeft);
    const headerRightClean = TuiSanitizer.sanitize(headerRight);
    const headerSpace = Math.max(1, innerWidth - headerLeftClean.length - headerRightClean.length);
    const headerContent = `${headerLeft}${" ".repeat(headerSpace)}${headerRight}`;
    const headerPad = Math.max(0, innerWidth - TuiSanitizer.sanitize(headerContent).length);
    lines.push(`${borderCyan}│${reset}${headerContent}${" ".repeat(headerPad)}${borderCyan}│${reset}`);

    // Separator line
    lines.push(`${borderCyan}├${"─".repeat(innerWidth)}┤${reset}`);

    // 3. Body rows
    const visibleRows = this.getVisibleRows();
    const overhead = 5; // top border, header, separator, footer separator, bottom border
    const maxVisible = Math.max(3, maxHeight - overhead);

    if (visibleRows.length === 0) {
      const emptyMsg = this.searchQuery
        ? `  (No models found matching "${this.searchQuery}")`
        : "  (No models available)";
      const pad = " ".repeat(Math.max(0, innerWidth - emptyMsg.length));
      lines.push(`${borderDim}│${reset}\x1b[90m${emptyMsg}${pad}${reset}${borderDim}│${reset}`);
      for (let i = 1; i < maxVisible; i++) {
        lines.push(`${borderDim}│${reset}${" ".repeat(innerWidth)}${borderDim}│${reset}`);
      }
    } else {
      const total = visibleRows.length;
      const safeSelected = Math.max(0, Math.min(this.selectedIndex, total - 1));

      // Viewport window adjustment
      if (safeSelected >= this.scrollOffset + maxVisible) {
        this.scrollOffset = safeSelected - maxVisible + 1;
      } else if (safeSelected < this.scrollOffset) {
        this.scrollOffset = safeSelected;
      }
      const startIdx = this.scrollOffset;
      const endIdx = Math.min(total, startIdx + maxVisible);

      for (let i = startIdx; i < endIdx; i++) {
        const row = visibleRows[i];
        if (!row) continue;
        const isSelected = i === safeSelected;

        if (row.type === "provider") {
          const folderGlyph = row.expanded ? "▼" : "▶";
          const countBadge = `[${row.count} models]`;
          const rawLeft = ` ${isSelected ? "▶" : " "} ${folderGlyph} ${row.displayName} `;
          const rawRight = `${countBadge} `;
          const availSpace = Math.max(
            1,
            innerWidth - TuiSanitizer.sanitize(rawLeft).length - TuiSanitizer.sanitize(rawRight).length
          );

          if (isSelected) {
            const rowContent = `\x1b[48;2;16;38;56m\x1b[1m\x1b[38;2;0;242;254m ▶ ${folderGlyph} ${row.displayName} \x1b[38;2;120;180;240m${" ".repeat(availSpace)}${countBadge} ${reset}`;
            const pad = Math.max(0, innerWidth - TuiSanitizer.sanitize(rowContent).length);
            lines.push(`${borderCyan}│${reset}${rowContent}${" ".repeat(pad)}${borderCyan}│${reset}`);
          } else {
            const rowContent = `   \x1b[38;2;0;242;254m${folderGlyph}\x1b[0m \x1b[1m\x1b[38;2;220;235;255m${row.displayName}\x1b[0m \x1b[90m${" ".repeat(availSpace)}${countBadge} ${reset}`;
            const pad = Math.max(0, innerWidth - TuiSanitizer.sanitize(rowContent).length);
            lines.push(`${borderDim}│${reset}${rowContent}${" ".repeat(pad)}${borderDim}│${reset}`);
          }
        } else {
          // Model item row
          const connector = row.isLastInGroup ? "└── " : "├── ";
          const ctxStr = `[${formatContextLength(row.model.contextLength)}]`;
          const priceStr = formatPricing(row.model.promptPricePerM, row.model.completionPricePerM);
          const isActive = row.model.id === this.activeModelId;
          const activeTag = isActive ? " (ACTIVE)" : "";

          // Target model display name
          const maxNameLen = Math.max(16, innerWidth - ctxStr.length - priceStr.length - activeTag.length - 18);
          const cleanName =
            row.model.name.length > maxNameLen
              ? `${row.model.name.slice(0, maxNameLen - 3)}...`
              : row.model.name;

          const rawLeft = ` ${isSelected ? "▶" : " "}    ${connector}${cleanName} `;
          const rawRight = `${ctxStr}  ${priceStr}${activeTag} `;
          const availSpace = Math.max(
            1,
            innerWidth - TuiSanitizer.sanitize(rawLeft).length - TuiSanitizer.sanitize(rawRight).length
          );

          if (isSelected) {
            const activeColor = isActive ? "\x1b[38;2;0;255;128m\x1b[1m" : "";
            const rowContent = `\x1b[48;2;16;38;56m\x1b[1m\x1b[38;2;0;242;254m ▶    \x1b[90m${connector}\x1b[38;2;255;255;255m${cleanName}${" ".repeat(availSpace)}\x1b[38;2;100;180;255m${ctxStr}  \x1b[38;2;0;220;140m${priceStr}${activeColor}${activeTag} ${reset}`;
            const pad = Math.max(0, innerWidth - TuiSanitizer.sanitize(rowContent).length);
            lines.push(`${borderCyan}│${reset}${rowContent}${" ".repeat(pad)}${borderCyan}│${reset}`);
          } else {
            const activeColor = isActive ? "\x1b[38;2;0;255;128m\x1b[1m" : "";
            const rowContent = `      \x1b[90m${connector}\x1b[38;2;200;210;230m${cleanName}\x1b[0m${" ".repeat(availSpace)}\x1b[38;2;100;150;200m${ctxStr}  \x1b[38;2;0;180;120m${priceStr}${activeColor}${activeTag} ${reset}`;
            const pad = Math.max(0, innerWidth - TuiSanitizer.sanitize(rowContent).length);
            lines.push(`${borderDim}│${reset}${rowContent}${" ".repeat(pad)}${borderDim}│${reset}`);
          }
        }
      }

      // Pad remaining empty lines if fewer visible rows than maxVisible
      const renderedCount = endIdx - startIdx;
      for (let i = renderedCount; i < maxVisible; i++) {
        lines.push(`${borderDim}│${reset}${" ".repeat(innerWidth)}${borderDim}│${reset}`);
      }
    }

    // 4. Footer hint line
    const hintText = " [↑/↓] Navigate  [Space/→] Expand/Collapse  [Enter] Select  [/] Filter  [Esc] Close ";
    const hintPad = Math.max(0, innerWidth - hintText.length);
    lines.push(`${borderCyan}╰─${reset}\x1b[90m${hintText}${"─".repeat(hintPad)}${reset}${borderCyan}╯${reset}`);

    return lines;
  }
}
