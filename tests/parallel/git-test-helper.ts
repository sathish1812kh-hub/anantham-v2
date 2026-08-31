import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";

const execAsync = promisify(exec);

export interface TempGitRepo {
  repoPath: string;
  initialCommit: string;
  cleanup: () => void;
}

/**
 * Initialize a real, isolated temporary Git repository for parallel tests.
 */
export async function createTempGitRepo(): Promise<TempGitRepo> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-git-test-"));
  const repoPath = path.resolve(tmpDir);

  // Initialize git repo
  await execAsync("git init -b main", { cwd: repoPath });
  await execAsync('git config user.name "Anantham Test"', { cwd: repoPath });
  await execAsync('git config user.email "test@anantham.ai"', { cwd: repoPath });

  // Create initial file
  fs.writeFileSync(path.join(repoPath, ".gitignore"), ".anantham/\n");
  fs.writeFileSync(path.join(repoPath, "README.md"), "# Anantham Test Repo\n");
  fs.mkdirSync(path.join(repoPath, "src", "domain"), { recursive: true });
  fs.writeFileSync(path.join(repoPath, "src", "domain", "task.ts"), "export const TaskSchema = {};\n");
  fs.writeFileSync(path.join(repoPath, "src", "domain", "event.ts"), "export const EventTypes = {};\n");
  fs.mkdirSync(path.join(repoPath, "src", "persistence", "migrations"), { recursive: true });
  fs.writeFileSync(path.join(repoPath, "src", "persistence", "migrations", "001_initial.ts"), "export const migration001 = {};\n");
  fs.writeFileSync(path.join(repoPath, "src", "index.ts"), "export * from './domain/task.js';\n");

  await execAsync("git add .", { cwd: repoPath });
  await execAsync('git commit -m "feat: initial commit"', { cwd: repoPath });

  const { stdout: headOut } = await execAsync("git rev-parse HEAD", { cwd: repoPath });
  const initialCommit = headOut.trim();

  const cleanup = () => {
    try {
      fs.rmSync(repoPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  return {
    repoPath,
    initialCommit,
    cleanup,
  };
}

/**
 * Seed project and session for foreign key satisfaction.
 */
export function createProjectAndSession(
  db: SqliteEngine,
  projectId: string,
  sessionId: string
): void {
  const projectRepo = new ProjectRepository(db);
  const sessionRepo = new SessionRepository(db);

  projectRepo.save({
    id: projectId,
    name: `Project ${projectId}`,
    rootPath: `C:/proj_${projectId}`,
    status: "active",
    tags: [],
    modelProfile: "default",
    memoryNamespace: "default",
    orchestrationProfile: "default",
    trustProfile: "developer",
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  });

  sessionRepo.save({
    id: sessionId,
    projectId: projectId,
    name: `Session ${sessionId}`,
    branch: "main",
    status: "active",
    modelProfile: "default",
    keyPoolProfile: "default",
    mode: "interactive",
    permissions: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
