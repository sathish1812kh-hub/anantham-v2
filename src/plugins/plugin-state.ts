/**
 * Anantham V2 — Plugin State Manager
 *
 * Provides scoped persistent key-value storage and schema migrations for plugins.
 */

export interface StateMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (oldState: Record<string, unknown>) => Record<string, unknown>;
}

export class PluginStateManager {
  private readonly store = new Map<string, Record<string, unknown>>();
  private readonly versions = new Map<string, number>();
  private readonly migrations = new Map<string, StateMigration[]>();

  public setState(pluginId: string, state: Record<string, unknown>, version: number = 1): void {
    this.store.set(pluginId, { ...state });
    this.versions.set(pluginId, version);
  }

  public getState(pluginId: string): Record<string, unknown> | undefined {
    return this.store.get(pluginId);
  }

  public getStateVersion(pluginId: string): number {
    return this.versions.get(pluginId) || 1;
  }

  public registerMigration(pluginId: string, migration: StateMigration): void {
    const list = this.migrations.get(pluginId) || [];
    list.push(migration);
    this.migrations.set(pluginId, list);
  }

  public migrateState(pluginId: string, targetVersion: number): Record<string, unknown> {
    let currentState = this.getState(pluginId) || {};
    let currentVersion = this.getStateVersion(pluginId);

    const pluginMigrations = this.migrations.get(pluginId) || [];

    while (currentVersion < targetVersion) {
      const step = pluginMigrations.find((m) => m.fromVersion === currentVersion);
      if (!step) {
        throw new Error(
          `Missing migration step for plugin "${pluginId}" from version ${currentVersion} to ${targetVersion}.`
        );
      }
      currentState = step.migrate(currentState);
      currentVersion = step.toVersion;
    }

    this.setState(pluginId, currentState, targetVersion);
    return currentState;
  }
}
