import {
  AgentManifest,
  AgentManifestSchema,
  AgentRecord,
  AgentRecordSchema,
  AgentStatus,
} from "../domain/agent.js";

/**
 * Registry managing Agent definitions, versioning, and project scoping.
 * PRD Part 2 Section 278, 280.
 */
export class AgentRegistry {
  private records = new Map<string, AgentRecord>();

  /**
   * Register a new agent manifest in the registry.
   */
  public register(
    manifest: AgentManifest,
    source: AgentRecord["source"] = "project",
    status: AgentStatus = "configured"
  ): AgentRecord {
    const validated = AgentManifestSchema.parse(manifest);

    const record: AgentRecord = {
      id: validated.id,
      manifest: validated,
      status,
      source,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    AgentRecordSchema.parse(record);
    this.records.set(record.id, record);
    return record;
  }

  /**
   * Unregister an agent definition.
   */
  public unregister(agentId: string): boolean {
    return this.records.delete(agentId);
  }

  /**
   * Retrieve an agent definition by ID.
   */
  public get(agentId: string): AgentRecord | undefined {
    return this.records.get(agentId);
  }

  /**
   * Check if an agent ID exists.
   */
  public has(agentId: string): boolean {
    return this.records.has(agentId);
  }

  /**
   * Update the status of an agent definition.
   */
  public updateStatus(agentId: string, status: AgentStatus): boolean {
    const record = this.records.get(agentId);
    if (!record) return false;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * List agent definitions, optionally filtered by project scope.
   */
  public list(projectId?: string): AgentRecord[] {
    const records = Array.from(this.records.values());
    if (!projectId) {
      return records;
    }
    return records.filter((r) => {
      if (r.manifest.scope === "global") return true;
      return r.manifest.projectId === projectId;
    });
  }

  /**
   * Clear all registered agents.
   */
  public clear(): void {
    this.records.clear();
  }
}
