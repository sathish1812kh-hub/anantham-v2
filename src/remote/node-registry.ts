import { randomUUID } from "node:crypto";
import {
  type NodeIdentity,
  type NodeRegistrationRequest,
  type NodeHeartbeatRequest,
  NodeIdentitySchema,
  NodeRegistrationRequestSchema,
  NodeHeartbeatRequestSchema,
} from "../domain/node.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { NodeRepository } from "../persistence/repositories/node-repository.js";
import { RemoteAuthVerifier } from "./remote-auth-verifier.js";

export interface NodeRegistryOptions {
  nodeRepo: NodeRepository;
  eventStore?: EventStore;
  authVerifier?: RemoteAuthVerifier;
  supportedRuntimeVersions?: string[];
}

/**
 * Remote Node Registry & Health Monitor.
 * PRD Part 2 Section 140–165.
 */
export class NodeRegistry {
  private readonly nodeRepo: NodeRepository;
  private readonly eventStore?: EventStore;
  private readonly authVerifier: RemoteAuthVerifier;
  private readonly supportedRuntimeVersions: string[];

  constructor(options: NodeRegistryOptions) {
    this.nodeRepo = options.nodeRepo;
    this.eventStore = options.eventStore;
    this.authVerifier = options.authVerifier ?? new RemoteAuthVerifier();
    this.supportedRuntimeVersions = options.supportedRuntimeVersions ?? ["2.0.0", "2.0.0-alpha.1"];
  }

  /**
   * Register a new remote worker node. Validates version compatibility and records in SQLite WAL.
   */
  public registerNode(request: NodeRegistrationRequest): NodeIdentity {
    const validated = NodeRegistrationRequestSchema.parse(request);

    // 1. Version Compatibility Check
    if (!this.supportedRuntimeVersions.includes(validated.runtimeVersion)) {
      throw new Error(
        `Incompatible node runtime version "${validated.runtimeVersion}". Supported versions: ${this.supportedRuntimeVersions.join(", ")}.`
      );
    }

    const now = new Date().toISOString();
    let authTokenHash: string | undefined;
    if (validated.authToken) {
      authTokenHash = this.authVerifier.signPayload(validated.authToken);
    }

    const node: NodeIdentity = NodeIdentitySchema.parse({
      id: validated.id,
      nodeVersion: validated.nodeVersion,
      runtimeVersion: validated.runtimeVersion,
      capabilities: validated.capabilities || [],
      executorProfiles: validated.executorProfiles || ["local"],
      supportedModels: validated.supportedModels || [],
      supportedTools: validated.supportedTools || [],
      projectScope: validated.projectScope || ["*"],
      status: "ONLINE",
      endpointUrl: validated.endpointUrl,
      registeredAt: now,
      lastHeartbeatAt: now,
      authTokenHash,
      metadata: validated.metadata || {},
    });

    this.nodeRepo.saveNode(node);

    this.emitEvent(EventTypes.NODE_REGISTERED, node, {
      capabilities: node.capabilities,
      projectScope: node.projectScope,
    });
    this.emitEvent(EventTypes.NODE_CONNECTED, node, {});

    return node;
  }

  /**
   * Process a node heartbeat.
   */
  public heartbeat(request: NodeHeartbeatRequest): NodeIdentity {
    const validated = NodeHeartbeatRequestSchema.parse(request);
    const node = this.nodeRepo.findNodeById(validated.nodeId);
    if (!node) {
      throw new Error(`Node "${validated.nodeId}" not found in registry.`);
    }

    if (node.status === "QUARANTINED") {
      throw new Error(`Node "${validated.nodeId}" is quarantined and cannot send heartbeats.`);
    }

    const now = new Date().toISOString();
    const newStatus = validated.status || (node.status === "OFFLINE" ? "ONLINE" : node.status);
    this.nodeRepo.updateHeartbeat(node.id, now, newStatus);

    node.lastHeartbeatAt = now;
    node.status = newStatus;

    this.emitEvent(EventTypes.NODE_HEARTBEAT, node, {
      activeDispatches: validated.activeDispatches,
    });

    return node;
  }

  /**
   * Select an eligible online worker node that satisfies required capabilities and project containment.
   */
  public findEligibleNode(
    requiredCapabilities: string[] = [],
    projectId: string,
    executorProfile?: string
  ): NodeIdentity | null {
    const onlineNodes = this.nodeRepo.listOnlineNodes();

    for (const node of onlineNodes) {
      if (node.status !== "ONLINE" && node.status !== "BUSY") {
        continue;
      }

      // Check project isolation
      if (!this.authVerifier.isProjectAllowed(node.projectScope, projectId)) {
        continue;
      }

      // Check executor profile
      if (executorProfile && !node.executorProfiles.includes(executorProfile)) {
        continue;
      }

      // Check capability subset match
      const hasAllCapabilities = requiredCapabilities.every((cap) =>
        node.capabilities.includes(cap)
      );
      if (!hasAllCapabilities) {
        continue;
      }

      return node;
    }

    return null;
  }

  /**
   * Mark node as DRAINING (no new dispatches will be sent).
   */
  public drainNode(nodeId: string): void {
    const node = this.nodeRepo.findNodeById(nodeId);
    if (node) {
      node.status = "DRAINING";
      this.nodeRepo.saveNode(node);
      this.emitEvent(EventTypes.NODE_DRAINING, node, {});
    }
  }

  /**
   * Quarantine a compromised or malicious node.
   */
  public quarantineNode(nodeId: string, reason: string): void {
    const node = this.nodeRepo.findNodeById(nodeId);
    if (node) {
      node.status = "QUARANTINED";
      this.nodeRepo.saveNode(node);
      this.emitEvent(EventTypes.NODE_QUARANTINED, node, { reason });
    }
  }

  /**
   * Scan for nodes whose heartbeats have stalled and mark them OFFLINE.
   */
  public detectStalledNodes(staleThresholdMs = 30000): string[] {
    const staleBefore = new Date(Date.now() - staleThresholdMs).toISOString();
    const stalled = this.nodeRepo.listStalledNodes(staleBefore);
    const stalledIds: string[] = [];

    for (const node of stalled) {
      node.status = "OFFLINE";
      this.nodeRepo.saveNode(node);
      stalledIds.push(node.id);
      this.emitEvent(EventTypes.NODE_DISCONNECTED, node, { reason: "Heartbeat timeout" });
    }

    return stalledIds;
  }

  public getNode(nodeId: string): NodeIdentity | null {
    return this.nodeRepo.findNodeById(nodeId);
  }

  public listAllNodes(): NodeIdentity[] {
    return this.nodeRepo.listAllNodes();
  }

  private emitEvent(type: string, node: NodeIdentity, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    this.eventStore.append({
      id: randomUUID(),
      schemaVersion: 1,
      actor: "system",
      timestamp: new Date().toISOString(),
      type,
      payload: {
        nodeId: node.id,
        nodeVersion: node.nodeVersion,
        runtimeVersion: node.runtimeVersion,
        status: node.status,
        ...payload,
      },
    });
  }
}
