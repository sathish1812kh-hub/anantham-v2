import { exec } from "node:child_process";
import { promisify } from "node:util";
import { type ToolRegistration } from "../tool-registry.js";
import { resolveSafePath } from "./path-utils.js";

const execAsync = promisify(exec);

export interface GitToolsOptions {
  projectRoot?: string;
}

export function createGitTools(options: GitToolsOptions = {}): ToolRegistration[] {
  const getRoot = () => options.projectRoot || process.cwd();

  const gitStatusTool: ToolRegistration = {
    definition: {
      name: "git_status",
      description: "Get Git working tree status for the project repository.",
      parametersSchema: {
        type: "object",
        properties: { path: { type: "string" } },
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const root = args.path ? resolveSafePath(getRoot(), args.path) : getRoot();
      const { stdout } = await execAsync("git status --porcelain", { cwd: root });
      return { status: stdout.trim(), clean: stdout.trim().length === 0 };
    },
  };

  const gitDiffTool: ToolRegistration = {
    definition: {
      name: "git_diff",
      description: "Get Git diff of working tree or staged changes.",
      parametersSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          cached: { type: "boolean" },
        },
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const root = getRoot();
      const flag = args.cached ? "--cached" : "";
      const pathArg = args.path ? ` -- "${resolveSafePath(root, args.path)}"` : "";
      const { stdout } = await execAsync(`git diff ${flag}${pathArg}`.trim(), { cwd: root });
      return { diff: stdout.trim() };
    },
  };

  const gitLogTool: ToolRegistration = {
    definition: {
      name: "git_log",
      description: "View recent Git commit log for the project repository.",
      parametersSchema: {
        type: "object",
        properties: { maxCount: { type: "number" } },
      },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async (args: any) => {
      const count = args.maxCount || 10;
      const { stdout } = await execAsync(`git log -n ${count} --oneline`, { cwd: getRoot() });
      return { commits: stdout.trim().split("\n").filter(Boolean) };
    },
  };

  const gitCommitTool: ToolRegistration = {
    definition: {
      name: "git_commit",
      description: "Create a Git commit with a specified commit message.",
      parametersSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
          allowEmpty: { type: "boolean" },
        },
        required: ["message"],
      },
      isIdempotent: false,
      riskLevel: "high",
    },
    handler: async (args: any) => {
      const emptyFlag = args.allowEmpty ? "--allow-empty" : "";
      const msg = JSON.stringify(args.message);
      const { stdout } = await execAsync(`git commit ${emptyFlag} -m ${msg}`.trim(), {
        cwd: getRoot(),
      });
      return { output: stdout.trim() };
    },
  };

  const worktreeListTool: ToolRegistration = {
    definition: {
      name: "worktree_list",
      description: "List active Git worktrees.",
      parametersSchema: { type: "object", properties: {} },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async () => {
      const { stdout } = await execAsync("git worktree list", { cwd: getRoot() });
      return { worktrees: stdout.trim().split("\n").filter(Boolean) };
    },
  };

  const worktreeAddTool: ToolRegistration = {
    definition: {
      name: "worktree_add",
      description: "Create an isolated Git worktree.",
      parametersSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          branch: { type: "string" },
        },
        required: ["path", "branch"],
      },
      isIdempotent: false,
      riskLevel: "high",
    },
    handler: async (args: any) => {
      const safePath = resolveSafePath(getRoot(), args.path);
      const { stdout } = await execAsync(`git worktree add "${safePath}" "${args.branch}"`, {
        cwd: getRoot(),
      });
      return { path: args.path, output: stdout.trim() };
    },
  };

  const worktreeRemoveTool: ToolRegistration = {
    definition: {
      name: "worktree_remove",
      description: "Remove an isolated Git worktree.",
      parametersSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      isIdempotent: false,
      riskLevel: "high",
    },
    handler: async (args: any) => {
      const safePath = resolveSafePath(getRoot(), args.path);
      const { stdout } = await execAsync(`git worktree remove "${safePath}" --force`, {
        cwd: getRoot(),
      });
      return { path: args.path, output: stdout.trim() };
    },
  };

  return [
    gitStatusTool,
    gitDiffTool,
    gitLogTool,
    gitCommitTool,
    worktreeListTool,
    worktreeAddTool,
    worktreeRemoveTool,
  ];
}
