/**
 * Unified Project Knowledge Graph
 * PRD-CODE-006: Project Knowledge Graph
 */

export type GraphEntityType =
  | "project"
  | "file"
  | "symbol"
  | "module"
  | "dependency"
  | "git_branch"
  | "session"
  | "task"
  | "memory"
  | "artifact"
  | "workflow"
  | "mcp"
  | "skill";

export interface GraphNode {
  id: string;
  type: GraphEntityType;
  name: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relation: string;
  weight?: number;
}

export class ProjectKnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  private adjacency: Map<string, Set<string>> = new Map();

  public addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
  }

  public getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  public addEdge(edge: GraphEdge): void {
    if (!this.nodes.has(edge.sourceId) || !this.nodes.has(edge.targetId)) {
      throw new Error(`Cannot add edge between missing nodes: ${edge.sourceId} -> ${edge.targetId}`);
    }
    this.edges.push(edge);
    this.adjacency.get(edge.sourceId)!.add(edge.targetId);
  }

  public getNeighbors(nodeId: string): GraphNode[] {
    const neighborIds = this.adjacency.get(nodeId);
    if (!neighborIds) return [];
    return Array.from(neighborIds)
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean);
  }

  public getEdgesFrom(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.sourceId === nodeId);
  }

  public getEdgesTo(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.targetId === nodeId);
  }

  public findNodesByType(type: GraphEntityType): GraphNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.type === type);
  }

  public findPath(startId: string, targetId: string): string[] | null {
    if (!this.nodes.has(startId) || !this.nodes.has(targetId)) return null;
    if (startId === targetId) return [startId];

    const queue: string[][] = [[startId]];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
      const currentPath = queue.shift()!;
      const current = currentPath[currentPath.length - 1];
      if (!current) continue;

      const neighbors = this.adjacency.get(current) ?? new Set();
      for (const next of neighbors) {
        if (next === targetId) {
          return [...currentPath, next];
        }
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...currentPath, next]);
        }
      }
    }

    return null;
  }

  public getGraphStats(): { nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> } {
    const typeDistribution: Record<string, number> = {};
    for (const node of this.nodes.values()) {
      typeDistribution[node.type] = (typeDistribution[node.type] ?? 0) + 1;
    }
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      typeDistribution,
    };
  }
}
