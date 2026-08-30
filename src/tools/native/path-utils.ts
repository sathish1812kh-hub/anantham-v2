import path from "node:path";

/**
 * Safely resolves and canonicalizes a path within the specified project root boundary.
 * Throws a SecurityError if traversal or escape is detected.
 */
export function resolveSafePath(projectRoot: string, targetPath: string): string {
  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("Target path must be a valid non-empty string.");
  }

  // Null byte injection check
  if (targetPath.includes("\0")) {
    throw new Error("Security violation: Null byte detected in path.");
  }

  // URL encoded traversal check
  if (targetPath.includes("%2e%2e") || targetPath.includes("%2E%2E")) {
    throw new Error("Security violation: Encoded traversal sequence detected.");
  }

  const normalizedRoot = path.resolve(projectRoot);
  const resolved = path.resolve(normalizedRoot, targetPath);

  // Containment check
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(
      `Security violation: Path "${targetPath}" attempts to escape project boundary "${projectRoot}".`
    );
  }

  return resolved;
}
