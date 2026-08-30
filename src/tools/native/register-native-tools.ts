import { type ToolRegistry } from "../tool-registry.js";
import { createFilesystemTools, type FilesystemToolsOptions } from "./filesystem-tools.js";
import { createSearchTools, type SearchToolsOptions } from "./search-tools.js";
import { createProcessTools, type ProcessToolsOptions } from "./process-tools.js";
import { createGitTools, type GitToolsOptions } from "./git-tools.js";
import { createArtifactTools, type ArtifactToolsOptions } from "./artifact-tools.js";
import { createMemoryTools, type MemoryToolsOptions } from "./memory-tools.js";
import { createNetworkTools, type NetworkToolsOptions } from "./network-tools.js";

export interface NativeToolsRegistrationOptions
  extends FilesystemToolsOptions,
    SearchToolsOptions,
    ProcessToolsOptions,
    GitToolsOptions,
    ArtifactToolsOptions,
    MemoryToolsOptions,
    NetworkToolsOptions {}

export function registerNativeTools(
  registry: ToolRegistry,
  options: NativeToolsRegistrationOptions = {}
): void {
  const tools = [
    ...createFilesystemTools(options),
    ...createSearchTools(options),
    ...createProcessTools(options),
    ...createGitTools(options),
    ...createArtifactTools(options),
    ...createMemoryTools(options),
    ...createNetworkTools(options),
  ];

  for (const tool of tools) {
    if (!registry.has(tool.definition.name)) {
      registry.register(tool);
    }
  }
}
