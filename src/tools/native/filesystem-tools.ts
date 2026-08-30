import fs from "node:fs";
import path from "node:path";
import { type ToolRegistration } from "../tool-registry.js";
import { resolveSafePath } from "./path-utils.js";

export interface FilesystemToolsOptions {
  projectRoot?: string;
  maxFileSize?: number;
}

export function createFilesystemTools(options: FilesystemToolsOptions = {}): ToolRegistration[] {
  const getRoot = () => options.projectRoot || process.cwd();
  const maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB

  const readFileTool: ToolRegistration = {
    definition: {
      name: "read_file",
      description: "Read text contents of a file within the project boundary.",
      parametersSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          encoding: { type: "string" },
        },
        required: ["path"],
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const safePath = resolveSafePath(getRoot(), args.path);
      const stat = fs.statSync(safePath);
      if (stat.size > maxFileSize) {
        throw new Error(`File size ${stat.size} exceeds maximum allowable read limit of ${maxFileSize} bytes.`);
      }
      const content = fs.readFileSync(safePath, {
        encoding: (args.encoding as BufferEncoding) || "utf8",
      });
      return { path: args.path, content, size: stat.size };
    },
  };

  const writeFileTool: ToolRegistration = {
    definition: {
      name: "write_file",
      description: "Write text contents to a file within the project boundary.",
      parametersSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          encoding: { type: "string" },
        },
        required: ["path", "content"],
      },
      isIdempotent: false,
      riskLevel: "medium",
    },
    handler: async (args: any) => {
      const safePath = resolveSafePath(getRoot(), args.path);
      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      fs.writeFileSync(safePath, args.content, {
        encoding: (args.encoding as BufferEncoding) || "utf8",
      });
      return { path: args.path, bytesWritten: Buffer.byteLength(args.content, (args.encoding as BufferEncoding) || "utf8") };
    },
  };

  const listDirTool: ToolRegistration = {
    definition: {
      name: "list_dir",
      description: "List entries in a directory within the project boundary.",
      parametersSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          recursive: { type: "boolean" },
        },
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const targetDir = args.path ? resolveSafePath(getRoot(), args.path) : getRoot();
      const entries = fs.readdirSync(targetDir, {
        withFileTypes: true,
        recursive: Boolean(args.recursive),
      });

      return {
        path: args.path || ".",
        entries: entries.map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
        })),
      };
    },
  };

  const fileStatTool: ToolRegistration = {
    definition: {
      name: "file_stat",
      description: "Inspect file or directory metadata within the project boundary.",
      parametersSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const safePath = resolveSafePath(getRoot(), args.path);
      const stat = fs.statSync(safePath);
      return {
        path: args.path,
        size: stat.size,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        mtime: stat.mtime.toISOString(),
      };
    },
  };

  const deleteFileTool: ToolRegistration = {
    definition: {
      name: "delete_file",
      description: "Delete a file or directory within the project boundary.",
      parametersSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          recursive: { type: "boolean" },
        },
        required: ["path"],
      },
      isIdempotent: false,
      riskLevel: "high",
    },
    handler: async (args: any) => {
      const safePath = resolveSafePath(getRoot(), args.path);
      if (!fs.existsSync(safePath)) {
        return { path: args.path, deleted: false, reason: "File not found." };
      }
      fs.rmSync(safePath, { recursive: Boolean(args.recursive), force: true });
      return { path: args.path, deleted: true };
    },
  };

  return [readFileTool, writeFileTool, listDirTool, fileStatTool, deleteFileTool];
}
