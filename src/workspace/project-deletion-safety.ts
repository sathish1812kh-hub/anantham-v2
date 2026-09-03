/**
 * Project Deletion Safety Guard & 3-Tier Remove Semantics
 * PRD-PROJ-003: Project Remove Semantics & Deletion Safety
 */

import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SqliteEngine } from "../persistence/sqlite-engine.js";
import { ProjectRepository } from "../persistence/repositories/project-repository.js";

export type ProjectDeletionTier =
  | "REGISTRY_ONLY"
  | "REGISTRY_AND_METADATA"
  | "DESTRUCTIVE";

export interface ProjectDeletionOptions {
  tier: ProjectDeletionTier;
  confirmToken?: string;
  metadataPath?: string;
}

export interface ProjectDeletionResult {
  projectId: string;
  projectName: string;
  tier: ProjectDeletionTier;
  registryDeleted: boolean;
  metadataDeleted: boolean;
  sourceDeleted: boolean;
  timestamp: string;
}

export class ProjectDeletionSafetyManager {
  private projectRepo: ProjectRepository;

  constructor(engine: SqliteEngine) {
    this.projectRepo = new ProjectRepository(engine);
  }

  public async removeProject(
    projectId: string,
    options: ProjectDeletionOptions = { tier: "REGISTRY_ONLY" }
  ): Promise<ProjectDeletionResult> {
    const project = this.projectRepo.findById(projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    let registryDeleted = false;
    let metadataDeleted = false;
    let sourceDeleted = false;

    switch (options.tier) {
      case "REGISTRY_ONLY": {
        // Tier 1: Remove DB registry entry only. Source & metadata untouched.
        this.projectRepo.delete(projectId);
        registryDeleted = true;
        break;
      }

      case "REGISTRY_AND_METADATA": {
        // Tier 2: Remove DB registry entry + purge Anantham metadata. Source files preserved.
        this.projectRepo.delete(projectId);
        registryDeleted = true;

        if (options.metadataPath && existsSync(options.metadataPath)) {
          rmSync(options.metadataPath, { recursive: true, force: true });
          metadataDeleted = true;
        }
        break;
      }

      case "DESTRUCTIVE": {
        // Tier 3: Explicit destructive deletion. Requires matching confirmation token.
        if (options.confirmToken !== project.name && options.confirmToken !== project.id) {
          throw new Error(
            `Safety Guard: Destructive deletion aborted. Confirmation token must match project name (${project.name}) or ID (${project.id}).`
          );
        }

        this.projectRepo.delete(projectId);
        registryDeleted = true;

        if (options.metadataPath && existsSync(options.metadataPath)) {
          rmSync(options.metadataPath, { recursive: true, force: true });
          metadataDeleted = true;
        }

        const projectRoot = resolve(project.rootPath);
        if (existsSync(projectRoot)) {
          rmSync(projectRoot, { recursive: true, force: true });
          sourceDeleted = true;
        }
        break;
      }

      default:
        throw new Error(`Unsupported deletion tier: ${options.tier}`);
    }

    return {
      projectId: project.id,
      projectName: project.name,
      tier: options.tier,
      registryDeleted,
      metadataDeleted,
      sourceDeleted,
      timestamp: new Date().toISOString(),
    };
  }
}
