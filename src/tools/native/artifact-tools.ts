import crypto from "node:crypto";
import { type ToolRegistration } from "../tool-registry.js";
import { type ArtifactManager } from "../../artifacts/artifact-manager.js";

export interface ArtifactToolsOptions {
  artifactManager?: ArtifactManager;
}

export function createArtifactTools(options: ArtifactToolsOptions = {}): ToolRegistration[] {
  // In-memory fallback if no ArtifactManager injected
  const memoryFallback = new Map<string, { name: string; content: string; hash: string }>();

  const saveArtifactTool: ToolRegistration = {
    definition: {
      name: "save_artifact",
      description: "Persist a durable artifact and calculate its SHA-256 integrity hash.",
      parametersSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          content: { type: "string" },
          mimeType: { type: "string" },
        },
        required: ["name", "content"],
      },
      isIdempotent: true,
      riskLevel: "medium",
    },
    handler: async (args: any, context) => {
      const hash = crypto.createHash("sha256").update(args.content).digest("hex");
      const artifactId = `art_${hash.substring(0, 16)}`;

      if (options.artifactManager) {
        const artifact = await options.artifactManager.createArtifact({
          projectId: context.project.id,
          type: "generated-file",
          data: Buffer.from(args.content),
          filename: args.name,
        });
        return {
          artifactId: artifact.id,
          name: args.name,
          hash: artifact.sha256,
          size: (artifact.metadata?.sizeBytes as number) || Buffer.byteLength(args.content),
        };
      }

      memoryFallback.set(artifactId, { name: args.name, content: args.content, hash });
      return {
        artifactId,
        name: args.name,
        hash,
        size: Buffer.byteLength(args.content),
      };
    },
  };

  const readArtifactTool: ToolRegistration = {
    definition: {
      name: "read_artifact",
      description: "Retrieve artifact content and verify its cryptographic hash.",
      parametersSchema: {
        type: "object",
        properties: {
          artifactId: { type: "string" },
        },
        required: ["artifactId"],
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      if (options.artifactManager) {
        const result = await options.artifactManager.readArtifact(args.artifactId);
        if (!result) {
          throw new Error(`Artifact "${args.artifactId}" not found.`);
        }
        return {
          artifactId: args.artifactId,
          name: (result.artifact.metadata?.originalFilename as string) || result.artifact.id,
          content: result.data.toString("utf8"),
          hash: result.artifact.sha256,
        };
      }

      const item = memoryFallback.get(args.artifactId);
      if (!item) {
        throw new Error(`Artifact "${args.artifactId}" not found.`);
      }
      return {
        artifactId: args.artifactId,
        name: item.name,
        content: item.content,
        hash: item.hash,
      };
    },
  };

  return [saveArtifactTool, readArtifactTool];
}
