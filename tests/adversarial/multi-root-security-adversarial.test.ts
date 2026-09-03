import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import { MultiRootManager } from "../../src/workspace/multi-root-manager.js";

describe("Adversarial Stress Suite: MultiRootManager & Path Traversal / Symlink Defenses", () => {
  const testDir = join(process.cwd(), ".test_adv_multiroot_" + Date.now());
  const manager = new MultiRootManager();
  const sessionId = "session_adv_sec_01";

  const rootADir = join(testDir, "rootA");
  const rootBDir = join(testDir, "rootB");
  const externalDir = join(testDir, "external_secret");

  beforeEach(() => {
    mkdirSync(rootADir, { recursive: true });
    mkdirSync(rootBDir, { recursive: true });
    mkdirSync(externalDir, { recursive: true });

    writeFileSync(join(rootADir, "fileA.ts"), "export const a = 1;");
    writeFileSync(join(rootBDir, "fileB.ts"), "export const b = 2;");
    writeFileSync(join(externalDir, "passwd.txt"), "secret_password_data");

    manager.registerSessionRoots(sessionId, [
      { id: "root-a", name: "RootA", uri: `file://${rootADir}`, path: rootADir },
      { id: "root-b", name: "RootB", uri: `file://${rootBDir}`, path: rootBDir, readOnly: true },
    ]);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("1. Path Traversal & Root Boundary Escalation Attacks", () => {
    it("blocks relative path traversal attacks trying to escape root (../../etc/passwd)", () => {
      const traversalAttempts = [
        "../../etc/passwd",
        "../../../../Windows/System32/cmd.exe",
        "../../../secret",
        "..\\..\\..\\Windows\\win.ini",
        "subfolder/../../../../external_secret/passwd.txt",
      ];

      for (const attempt of traversalAttempts) {
        const check = manager.validateAccess(sessionId, attempt, "read");
        expect(check.allowed, `Expected traversal "${attempt}" to be blocked`).toBe(false);
        expect(check.reason).toBeDefined();
      }
    });

    it("blocks access to absolute paths outside of configured workspace roots", () => {
      const externalFilePath = join(externalDir, "passwd.txt");
      const check = manager.validateAccess(sessionId, externalFilePath, "read");

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("does not belong to any configured root");
    });

    it("allows valid nested subdirectories inside registered workspace roots", () => {
      const nestedDir = join(rootADir, "src", "modules");
      mkdirSync(nestedDir, { recursive: true });
      const validFile = join(nestedDir, "module.ts");
      writeFileSync(validFile, "export const mod = 100;");

      const check = manager.validateAccess(sessionId, validFile, "read");
      expect(check.allowed).toBe(true);

      const resolved = manager.resolvePathToRoot(sessionId, validFile);
      expect(resolved).toBeDefined();
      expect(resolved!.root.id).toBe("root-a");
      expect(resolved!.relativePath.replace(/\\/g, "/")).toBe("src/modules/module.ts");
    });
  });

  describe("2. Symlink Escape & Canonical Path Boundary Protection", () => {
    it("safely handles symlink pointing outside the workspace root", () => {
      const symlinkTarget = join(externalDir, "passwd.txt");
      const symlinkInsideRoot = join(rootADir, "symlink_passwd.txt");

      try {
        symlinkSync(symlinkTarget, symlinkInsideRoot, "file");
      } catch {
        // Skip if OS permission prevents symlink creation in non-elevated shell
        return;
      }

      // If symlink resolution is active: realpathSync resolves to externalDir/passwd.txt which is outside rootA
      const check = manager.validateAccess(sessionId, symlinkInsideRoot, "read");
      // Must not allow access since canonical path is outside workspace root!
      expect(check.allowed).toBe(false);
    });

    it("safely handles symlinked directory pointing outside the workspace root", () => {
      const symlinkDirInsideRoot = join(rootADir, "external_link");

      try {
        symlinkSync(externalDir, symlinkDirInsideRoot, "junction");
      } catch {
        // Skip if OS permission prevents junction/symlink creation
        return;
      }

      const fileThroughSymlink = join(symlinkDirInsideRoot, "passwd.txt");
      const check = manager.validateAccess(sessionId, fileThroughSymlink, "read");

      // Canonical path resolves to externalDir, which does not belong to root-a
      expect(check.allowed).toBe(false);
    });
  });

  describe("3. Read-Only Root Policy Enforcement", () => {
    it("allows read access to read-only root but strictly blocks write access", () => {
      const readOnlyFile = join(rootBDir, "fileB.ts");

      const readCheck = manager.validateAccess(sessionId, readOnlyFile, "read");
      expect(readCheck.allowed).toBe(true);

      const writeCheck = manager.validateAccess(sessionId, readOnlyFile, "write");
      expect(writeCheck.allowed).toBe(false);
      expect(writeCheck.reason).toContain("read-only");
    });

    it("allows both read and write access to normal (readWrite) roots", () => {
      const fileA = join(rootADir, "fileA.ts");

      const readCheck = manager.validateAccess(sessionId, fileA, "read");
      expect(readCheck.allowed).toBe(true);

      const writeCheck = manager.validateAccess(sessionId, fileA, "write");
      expect(writeCheck.allowed).toBe(true);
    });
  });

  describe("4. Session Isolation & Multi-Root Edge Cases", () => {
    it("rejects access for non-existent session IDs", () => {
      const check = manager.validateAccess("unregistered_session_xyz", join(rootADir, "fileA.ts"), "read");
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("does not belong to any configured root");
    });

    it("correctly identifies missing or deleted roots via checkRootsExist", () => {
      const ghostRootDir = join(testDir, "ghost_root_123");
      const ghostSession = "ghost_session";

      manager.registerSessionRoots(ghostSession, [
        { id: "ghost-1", name: "Ghost", uri: `file://${ghostRootDir}`, path: ghostRootDir },
      ]);

      const status = manager.checkRootsExist(ghostSession);
      expect(status.length).toBe(1);
      expect(status[0]!.rootId).toBe("ghost-1");
      expect(status[0]!.exists).toBe(false);
    });
  });
});
