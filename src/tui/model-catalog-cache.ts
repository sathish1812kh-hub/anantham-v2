/**
 * Architectural facade re-export for ModelCatalogCache.
 * Provides backward-compatible import location under src/tui/
 */
export * from "../persistence/model-catalog-cache.js";
export { ModelCatalogCache as default } from "../persistence/model-catalog-cache.js";
