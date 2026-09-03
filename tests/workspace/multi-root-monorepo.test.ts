import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { MultiRootManager } from "../../src/workspace/multi-root-manager.js";

describe("PRD-PROJ-009: Multi-Root Workspace & Monorepo Support", () => {
  const testDir = join(process.cwd(), ".test_multi_root_" + Date.now());
  let manager: MultiRootManager;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    manager = new MultiRootManager();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("registers multiple session roots and validates independent boundaries and read-only permissions", () => {
    const frontendDir = join(testDir, "frontend");
    const backendDir = join(testDir, "backend");
    const docsDir = join(testDir, "docs");
    mkdirSync(frontendDir, { recursive: true });
    mkdirSync(backendDir, { recursive: true });
    mkdirSync(docsDir, { recursive: true });

    manager.registerSessionRoots("sess_100", [
      { id: "root_fe", name: "Frontend", uri: "file://frontend", path: frontendDir },
      { id: "root_be", name: "Backend", uri: "file://backend", path: backendDir },
      { id: "root_docs", name: "Docs", uri: "file://docs", path: docsDir, readOnly: true },
    ]);

    const roots = manager.getSessionRoots("sess_100");
    expect(roots.length).toBe(3);

    // Resolves file inside frontend
    const feFile = join(frontendDir, "src", "App.tsx");
    const feMatch = manager.resolvePathToRoot("sess_100", feFile);
    expect(feMatch?.root.id).toBe("root_fe");
    expect(feMatch?.relativePath).toBe(join("src", "App.tsx"));

    // Write access to frontend allowed
    const writeFe = manager.validateAccess("sess_100", feFile, "write");
    expect(writeFe.allowed).toBe(true);

    // Read access to docs allowed
    const docFile = join(docsDir, "README.md");
    const readDoc = manager.validateAccess("sess_100", docFile, "read");
    expect(readDoc.allowed).toBe(true);

    // Write access to readOnly docs denied
    const writeDoc = manager.validateAccess("sess_100", docFile, "write");
    expect(writeDoc.allowed).toBe(false);
    expect(writeDoc.reason).toContain("read-only");

    // Access outside all roots denied
    const outsideFile = join(testDir, "unauthorized", "secrets.env");
    const accessOutside = manager.validateAccess("sess_100", outsideFile, "read");
    expect(accessOutside.allowed).toBe(false);
    expect(accessOutside.reason).toContain("does not belong to any configured root");
  });

  it("guards against path traversal attacks attempting to escape root bounds", () => {
    const pkgDir = join(testDir, "my_package");
    mkdirSync(pkgDir, { recursive: true });

    manager.registerSessionRoots("sess_sec", [
      { id: "root_pkg", name: "Package", uri: "file://pkg", path: pkgDir },
    ]);

    // Path traversal attempt: ../../etc/passwd or ../secret
    const traversalAttempt = join(pkgDir, "..", "..", "secrets.env");
    const accessCheck = manager.validateAccess("sess_sec", traversalAttempt, "read");
    expect(accessCheck.allowed).toBe(false);
  });

  it("checks root directory existence across sessions", () => {
    const existingDir = join(testDir, "existing_root");
    const missingDir = join(testDir, "missing_root");
    mkdirSync(existingDir, { recursive: true });

    manager.registerSessionRoots("sess_check", [
      { id: "root_1", name: "Existing", uri: "file://1", path: existingDir },
      { id: "root_2", name: "Missing", uri: "file://2", path: missingDir },
    ]);

    const existsList = manager.checkRootsExist("sess_check");
    expect(existsList).toEqual([
      { rootId: "root_1", exists: true },
      { rootId: "root_2", exists: false },
    ]);
  });
});
