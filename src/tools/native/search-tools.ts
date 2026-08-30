import fs from "node:fs";
import path from "node:path";
import { type ToolRegistration } from "../tool-registry.js";
import { resolveSafePath } from "./path-utils.js";

export interface SearchToolsOptions {
  projectRoot?: string;
  defaultMaxResults?: number;
}

export function createSearchTools(options: SearchToolsOptions = {}): ToolRegistration[] {
  const getRoot = () => options.projectRoot || process.cwd();
  const defaultMax = options.defaultMaxResults || 50;

  function walkDirectory(
    dir: string,
    fileList: string[] = [],
    root: string
  ): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "dist" ||
        entry.name === ".codegraph"
      ) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDirectory(fullPath, fileList, root);
      } else if (entry.isFile()) {
        fileList.push(path.relative(root, fullPath).replace(/\\/g, "/"));
      }
    }
    return fileList;
  }

  const searchTextTool: ToolRegistration = {
    definition: {
      name: "search_text",
      description: "Search for text or regex pattern in project files.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          path: { type: "string" },
          isRegex: { type: "boolean" },
          caseSensitive: { type: "boolean" },
          maxResults: { type: "number" },
        },
        required: ["query"],
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const root = getRoot();
      const searchRoot = args.path ? resolveSafePath(root, args.path) : root;
      const maxResults = args.maxResults || defaultMax;
      const files = walkDirectory(searchRoot, [], root);

      let matcher: RegExp;
      if (args.isRegex) {
        matcher = new RegExp(args.query, args.caseSensitive ? "g" : "gi");
      } else {
        const queryStr = String(args.query || "");
        const escaped = queryStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        matcher = new RegExp(escaped, args.caseSensitive ? "g" : "gi");
      }

      const matches: Array<{ file: string; line: number; lineContent: string }> = [];

      for (const relFile of files) {
        if (matches.length >= maxResults) break;
        const absFile = path.join(root, relFile);
        try {
          const content = fs.readFileSync(absFile, "utf8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] || "";
            if (matcher.test(line)) {
              matches.push({
                file: relFile,
                line: i + 1,
                lineContent: line.trim(),
              });
              matcher.lastIndex = 0; // reset state
              if (matches.length >= maxResults) break;
            }
          }
        } catch {
          // Ignore binary / unreadable files
        }
      }

      return {
        query: args.query,
        matchCount: matches.length,
        matches,
      };
    },
  };

  const findFilesTool: ToolRegistration = {
    definition: {
      name: "find_files",
      description: "Find files by pattern matching within the project boundary.",
      parametersSchema: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
          maxResults: { type: "number" },
        },
        required: ["pattern"],
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const root = getRoot();
      const searchRoot = args.path ? resolveSafePath(root, args.path) : root;
      const maxResults = args.maxResults || defaultMax;
      const files = walkDirectory(searchRoot, [], root);

      const patternLower = String(args.pattern).toLowerCase();
      const matchedFiles = files
        .filter((file) => file.toLowerCase().includes(patternLower))
        .slice(0, maxResults);

      return {
        pattern: args.pattern,
        matchCount: matchedFiles.length,
        files: matchedFiles,
      };
    },
  };

  return [searchTextTool, findFilesTool];
}
