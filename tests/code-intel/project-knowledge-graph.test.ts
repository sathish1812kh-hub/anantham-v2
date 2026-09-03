import { describe, it, expect } from "vitest";
import { ProjectKnowledgeGraph } from "../../src/code-intel/project-knowledge-graph.js";

describe("PRD-CODE-006: Project Knowledge Graph", () => {
  it("constructs cross-entity relationships and traverses path between Project, Files, Symbols, Tasks, and Memory", () => {
    const pkg = new ProjectKnowledgeGraph();

    // Add nodes across entity types
    pkg.addNode({ id: "proj_1", type: "project", name: "Anantham", metadata: { root: "/repo" } });
    pkg.addNode({ id: "file_1", type: "file", name: "auth.ts", metadata: { path: "src/auth.ts" } });
    pkg.addNode({ id: "sym_1", type: "symbol", name: "AuthService", metadata: { kind: "class" } });
    pkg.addNode({ id: "task_1", type: "task", name: "Implement OAuth", metadata: { status: "completed" } });
    pkg.addNode({ id: "mem_1", type: "memory", name: "Auth Token Fact", metadata: { scope: "project" } });

    // Connect entities with edges
    pkg.addEdge({ sourceId: "proj_1", targetId: "file_1", relation: "contains" });
    pkg.addEdge({ sourceId: "file_1", targetId: "sym_1", relation: "declares" });
    pkg.addEdge({ sourceId: "task_1", targetId: "sym_1", relation: "modifies" });
    pkg.addEdge({ sourceId: "task_1", targetId: "mem_1", relation: "produced_memory" });

    // Query neighbors
    const fileNeighbors = pkg.getNeighbors("file_1");
    expect(fileNeighbors.some((n) => n.id === "sym_1")).toBe(true);

    // Query path from Project to Symbol
    const path = pkg.findPath("proj_1", "sym_1");
    expect(path).toEqual(["proj_1", "file_1", "sym_1"]);

    // Query nodes by type
    const symbols = pkg.findNodesByType("symbol");
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe("AuthService");

    // Check stats
    const stats = pkg.getGraphStats();
    expect(stats.nodeCount).toBe(5);
    expect(stats.edgeCount).toBe(4);
    expect(stats.typeDistribution["project"]).toBe(1);
    expect(stats.typeDistribution["symbol"]).toBe(1);
  });
});
