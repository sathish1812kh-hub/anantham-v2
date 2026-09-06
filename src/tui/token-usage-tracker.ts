/**
 * Architectural facade re-export for TokenMetricsManager / TokenUsageTracker.
 * Provides backward-compatible import location under src/tui/
 */
export * from "../persistence/token-metrics-manager.js";
export { TokenMetricsManager as TokenUsageTracker } from "../persistence/token-metrics-manager.js";
export { TokenMetricsManager as default } from "../persistence/token-metrics-manager.js";
