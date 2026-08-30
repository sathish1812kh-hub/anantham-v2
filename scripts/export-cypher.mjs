import fs from "node:fs";
import path from "node:path";

const graphPath = fs.existsSync("graphify-out/graph.json")
  ? "graphify-out/graph.json"
  : fs.existsSync(".graphify/graph.json")
  ? ".graphify/graph.json"
  : null;

if (!graphPath) {
  console.log("No graph.json found in graphify-out or .graphify. Skipping cypher export.");
  process.exit(0);
}

try {
  const data = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
  const nodes = data.nodes || [];
  const links = data.links || data.edges || [];

  const cypherLines = [
    "// Anantham V2 Generated Cypher Script",
    "// Generated at: " + new Date().toISOString(),
    "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE;",
    ""
  ];

  // Batch nodes
  for (const node of nodes) {
    const id = JSON.stringify(node.id || "");
    const label = JSON.stringify(node.label || node.norm_label || "");
    const fileType = JSON.stringify(node.file_type || "unknown");
    const sourceFile = JSON.stringify(node.source_file || "");
    const community = node.community !== undefined ? Number(node.community) : 0;

    cypherLines.push(
      `MERGE (n:Entity {id: ${id}}) SET n.label = ${label}, n.file_type = ${fileType}, n.source_file = ${sourceFile}, n.community = ${community};`
    );
  }

  // Batch links
  for (const link of links) {
    const source = JSON.stringify(link.source || "");
    const target = JSON.stringify(link.target || "");
    const relType = ((link.relation || link.type || "RELATES_TO").toUpperCase().replace(/[^A-Z0-9_]/g, "_")) || "RELATES_TO";
    const weight = link.weight !== undefined ? Number(link.weight) : 1.0;

    cypherLines.push(
      `MATCH (a:Entity {id: ${source}}), (b:Entity {id: ${target}}) MERGE (a)-[r:${relType}]->(b) SET r.weight = ${weight};`
    );
  }

  const outDir = fs.existsSync("graphify-out") ? "graphify-out" : ".graphify";
  const outFile = path.join(outDir, "cypher.txt");
  fs.writeFileSync(outFile, cypherLines.join("\n"), "utf-8");
  fs.writeFileSync("scripts/neo4j-sync.cypher", cypherLines.join("\n"), "utf-8");

  console.log(`[Cypher] Exported ${nodes.length} nodes and ${links.length} relations to ${outFile} and scripts/neo4j-sync.cypher`);
} catch (err) {
  console.error("[Cypher Export Error]:", err.message);
}
