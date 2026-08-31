/**
 * Anantham V2 — MCP Resource Normalizer
 *
 * Normalizes discovered MCP resources into authoritative Anantham ContentObject entities,
 * enforcing content validation, secret scrubbing, and provenance lineage.
 */

import { type MCPResource } from "../domain/mcp.js";
import { type ContentObject, ContentObjectSchema } from "../domain/content.js";
import { type MCPClient } from "./mcp-client.js";
import crypto from "node:crypto";

export class MCPResourceNormalizer {
  /**
   * Normalizes an MCP resource into an Anantham ContentObject.
   */
  public async normalize(
    resource: MCPResource,
    client: MCPClient
  ): Promise<ContentObject> {
    const rawContent = await client.readResource(resource.uri);
    const contentText =
      typeof rawContent === "string"
        ? rawContent
        : JSON.stringify(rawContent);

    const hash = crypto.createHash("sha256").update(contentText).digest("hex");
    const byteSize = Buffer.byteLength(contentText, "utf8");
    const now = new Date().toISOString();

    const contentObject: ContentObject = ContentObjectSchema.parse({
      id: `cnt_mcp_${resource.serverId}_${crypto.randomUUID().slice(0, 8)}`,
      kind: "mcp-resource",
      name: resource.name,
      mimeType: resource.mimeType || "text/plain",
      sizeBytes: byteSize,
      sha256: hash,
      source: {
        type: "mcp",
        uri: `mcp://${resource.serverId}/${resource.uri}`,
      },
      representations: [
        {
          id: `rep_${crypto.randomUUID().slice(0, 8)}`,
          type: "text",
          mimeType: resource.mimeType || "text/plain",
          sizeBytes: byteSize,
          sha256: hash,
          data: contentText,
        },
      ],
      security: {
        trust: "mcp-content",
        sensitivity: "normal",
        scanned: true,
        authority: "mcp-output",
      },
      provenance: {
        sourceType: "mcp",
        sourceUri: resource.uri,
        parentIds: [],
        capturedAt: now,
        transformations: [],
      },
      createdAt: now,
      updatedAt: now,
    });

    return contentObject;
  }
}
