import { AnsiGradient } from "./ansi-gradient.js";
import { TokenMetricsManager } from "../persistence/token-metrics-manager.js";

export class TokenDashboardRenderer {
  public static formatTokens(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(2)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toLocaleString();
  }

  public static formatUsd(usd: number): string {
    if (usd >= 100) {
      return `$${usd.toFixed(2)}`;
    }
    if (usd >= 1) {
      return `$${usd.toFixed(3)}`;
    }
    return `$${usd.toFixed(4)}`;
  }

  public static render(width: number = 80, _height: number = 24): string[] {
    const lines: string[] = [];
    const metrics = TokenMetricsManager.getInstance();
    const today = metrics.getDailySummary();
    const mtd = metrics.getMtdSummary();
    const budget = metrics.getMonthlyBudget();
    const trend = metrics.getSevenDayTrend();
    const topModels = metrics.getTopModels(4);

    const borderCyan = "\x1b[38;2;0;242;254m";
    const reset = "\x1b[0m";
    const bold = "\x1b[1m";
    const dim = "\x1b[90m";

    const contentWidth = Math.max(76, width);

    // 1. Dashboard Subheader
    const title = " ❖ ANANTHAM TOKEN USAGE MATRIX & FINANCIAL DASHBOARD ";
    const subTitle = " Real-Time Consumption Analytics & Model Cost Attribution ";
    const titleGrad = AnsiGradient.linearGradient(
      title,
      AnsiGradient.PALETTES.cyanBlue[0],
      AnsiGradient.PALETTES.cyanBlue[1]
    );

    const padTop = Math.max(0, contentWidth - title.length - 2);
    lines.push(
      `${borderCyan}╭─${reset}${bold}${titleGrad}${borderCyan}${"─".repeat(padTop)}╮${reset}`
    );
    const padSub = Math.max(0, contentWidth - subTitle.length - 2);
    lines.push(`${borderCyan}│${reset}${dim}${subTitle}${" ".repeat(padSub)}${reset}${borderCyan}│${reset}`);
    lines.push(`${borderCyan}├${"─".repeat(contentWidth - 2)}┤${reset}`);

    // 2. Overview Metrics Grid
    const colW = Math.floor((contentWidth - 6) / 3);
    const card1Title = " [ TODAY'S TOKENS ]";
    const card2Title = " [ MONTH-TO-DATE ]";
    const card3Title = " [ ESTIMATED COST & BUDGET ]";

    lines.push(
      `${borderCyan}│${reset} ${bold}\x1b[38;2;79;172;254m${card1Title.padEnd(colW)}${reset} │ ${bold}\x1b[38;2;247;37;133m${card2Title.padEnd(colW)}${reset} │ ${bold}\x1b[38;2;0;242;152m${card3Title.padEnd(colW)}${reset} ${borderCyan}│${reset}`
    );

    // Row 1
    const c1_1 = `Total: ${TokenDashboardRenderer.formatTokens(today.totalTokens)} (${today.requestCount} reqs)`;
    const c2_1 = `Total: ${TokenDashboardRenderer.formatTokens(mtd.totalTokens)} (${mtd.requestCount} reqs)`;
    const c3_1 = `Spent: ${TokenDashboardRenderer.formatUsd(mtd.totalCostUsd)} / $${budget.toFixed(0)}`;
    lines.push(
      `${borderCyan}│${reset} ${c1_1.padEnd(colW)} │ ${c2_1.padEnd(colW)} │ ${c3_1.padEnd(colW)} ${borderCyan}│${reset}`
    );

    // Row 2
    const c1_2 = `In: ${TokenDashboardRenderer.formatTokens(today.totalInputTokens)} | Out: ${TokenDashboardRenderer.formatTokens(today.totalOutputTokens)}`;
    const c2_2 = `In: ${TokenDashboardRenderer.formatTokens(mtd.totalInputTokens)} | Out: ${TokenDashboardRenderer.formatTokens(mtd.totalOutputTokens)}`;
    const budgetPct = Math.min(100, Math.round((mtd.totalCostUsd / (budget || 1)) * 100));
    const budgetBar = AnsiGradient.horizontalBar(mtd.totalCostUsd, budget, Math.max(10, colW - 8), "neonPinkViolet");
    lines.push(
      `${borderCyan}│${reset} ${dim}${c1_2.padEnd(colW)}${reset} │ ${dim}${c2_2.padEnd(colW)}${reset} │ ${budgetBar} ${budgetPct}% ${borderCyan}│${reset}`
    );

    // Row 3
    const c1_3 = `Cached: ${TokenDashboardRenderer.formatTokens(today.totalCachedTokens)} | Cost: ${TokenDashboardRenderer.formatUsd(today.totalCostUsd)}`;
    const c2_3 = `Cached: ${TokenDashboardRenderer.formatTokens(mtd.totalCachedTokens)} | Cost: ${TokenDashboardRenderer.formatUsd(mtd.totalCostUsd)}`;
    const c3_3 = `Today: ${TokenDashboardRenderer.formatUsd(today.totalCostUsd)} (Burn Rate: Normal)`;
    lines.push(
      `${borderCyan}│${reset} ${dim}${c1_3.padEnd(colW)}${reset} │ ${dim}${c2_3.padEnd(colW)}${reset} │ ${dim}${c3_3.padEnd(colW)}${reset} ${borderCyan}│${reset}`
    );

    lines.push(`${borderCyan}├${"─".repeat(contentWidth - 2)}┤${reset}`);

    // 3. Top Consuming Models Leaderboard
    const modelHeader = " TOP CONSUMING MODELS (LEADERBOARD) ";
    const modelHeaderGrad = AnsiGradient.linearGradient(
      modelHeader,
      AnsiGradient.PALETTES.amberCoral[0],
      AnsiGradient.PALETTES.amberCoral[1]
    );
    const padModelHead = Math.max(0, contentWidth - modelHeader.length - 2);
    lines.push(`${borderCyan}│${reset}${bold}${modelHeaderGrad}${dim}${"─".repeat(padModelHead)}${reset}${borderCyan}│${reset}`);

    // Model Columns Header
    const mCol1 = "  MODEL";
    const mCol2 = "TOKENS";
    const mCol3 = "COST (USD)";
    const mCol4 = "ALLOCATION SHARE";
    const tableHeader = `${mCol1.padEnd(34)} ${mCol2.padStart(10)}   ${mCol3.padStart(12)}   ${mCol4}`;
    lines.push(
      `${borderCyan}│${reset}${dim}${tableHeader.padEnd(contentWidth - 2)}${reset}${borderCyan}│${reset}`
    );

    for (const m of topModels) {
      const modelName = m.modelId.length > 30 ? `${m.modelId.slice(0, 27)}...` : m.modelId;
      const tokensStr = TokenDashboardRenderer.formatTokens(m.totalTokens);
      const costStr = TokenDashboardRenderer.formatUsd(m.costUsd);
      const barWidth = Math.max(8, contentWidth - 66);
      const bar = AnsiGradient.horizontalBar(m.percentage, 100, barWidth, "cyanBlue");

      const rowText = `  \x1b[38;2;79;172;254m${modelName.padEnd(32)}${reset} \x1b[38;2;220;220;240m${tokensStr.padStart(10)}${reset}   \x1b[38;2;0;242;152m${costStr.padStart(12)}${reset}   ${bar} \x1b[1m${String(m.percentage).padStart(2)}%${reset}`;
      const rawLen = 2 + 32 + 1 + 10 + 3 + 12 + 3 + barWidth + 1 + 3;
      const padRow = Math.max(0, contentWidth - rawLen - 2);
      lines.push(`${borderCyan}│${reset}${rowText}${" ".repeat(padRow)}${borderCyan}│${reset}`);
    }

    lines.push(`${borderCyan}├${"─".repeat(contentWidth - 2)}┤${reset}`);

    // 4. 7-Day Trend & Volatility Sparkline
    const trendValues = trend.map((t) => t.tokens);
    const spark = AnsiGradient.sparkline(trendValues, "cyanBlue");
    const trendTitle = " 7-DAY CONSUMPTION TREND & VOLATILITY SPARKLINE ";
    const trendGrad = AnsiGradient.linearGradient(
      trendTitle,
      AnsiGradient.PALETTES.neonPinkViolet[0],
      AnsiGradient.PALETTES.neonPinkViolet[1]
    );
    const padTrendHead = Math.max(0, contentWidth - trendTitle.length - 2);
    lines.push(`${borderCyan}│${reset}${bold}${trendGrad}${dim}${"─".repeat(padTrendHead)}${reset}${borderCyan}│${reset}`);

    const maxDayTokens = Math.max(...trendValues, 1);
    const sparkRow = `  Trend Activity: [ ${spark} ]  Peak: ${TokenDashboardRenderer.formatTokens(maxDayTokens)} tokens/day`;
    lines.push(`${borderCyan}│${reset}${sparkRow}${" ".repeat(Math.max(0, contentWidth - 55))}${borderCyan}│${reset}`);

    // Horizontal compact daily table
    const dayCols = trend
      .map((t) => `${t.date.slice(5)}: ${TokenDashboardRenderer.formatTokens(t.tokens)}`)
      .join(" │ ");
    const dayRow = `  ${dayCols}`;
    const padDays = Math.max(0, contentWidth - dayRow.length - 2);
    lines.push(`${borderCyan}│${reset}${dim}${dayRow}${" ".repeat(padDays)}${reset}${borderCyan}│${reset}`);

    // Bottom Border & Navigation Hint
    const navHints = " [ESC] Back to Dashboard  [R] Refresh Stats  [/] Command Palette ";
    const padNav = Math.max(0, contentWidth - navHints.length - 2);
    lines.push(
      `${borderCyan}╰─${reset}${bold}\x1b[38;2;0;242;254m${navHints}${reset}${borderCyan}${"─".repeat(padNav)}╯${reset}`
    );

    return lines;
  }
}
