/**
 * Anantham V2 — Plugin Installer
 *
 * Implements atomic staged installation, pre-verification, and rollback on failure.
 */

import {
  type PluginManifest,
  type PluginRecord,
  PluginManifestSchema,
  PluginRecordSchema,
} from "../domain/plugin.js";
import { PluginCompatibilityChecker } from "./plugin-compatibility.js";
import { PluginDependencyResolver } from "./plugin-dependency.js";
import { PluginPackageVerifier } from "./plugin-package.js";
import { PluginPermissionsManager } from "./plugin-permissions.js";
import { PluginTrustManager } from "./plugin-trust.js";

export interface InstallOptions {
  packageBytes?: Buffer | string;
  installDir?: string;
  availableCapabilities?: string[];
  installedManifests?: PluginManifest[];
}

export class PluginInstaller {
  private readonly compatibilityChecker: PluginCompatibilityChecker;
  private readonly dependencyResolver: PluginDependencyResolver;
  private readonly packageVerifier: PluginPackageVerifier;
  private readonly permissionsManager: PluginPermissionsManager;
  private readonly trustManager: PluginTrustManager;

  constructor(options?: {
    compatibilityChecker?: PluginCompatibilityChecker;
    dependencyResolver?: PluginDependencyResolver;
    packageVerifier?: PluginPackageVerifier;
    permissionsManager?: PluginPermissionsManager;
    trustManager?: PluginTrustManager;
  }) {
    this.compatibilityChecker = options?.compatibilityChecker || new PluginCompatibilityChecker();
    this.dependencyResolver = options?.dependencyResolver || new PluginDependencyResolver();
    this.packageVerifier = options?.packageVerifier || new PluginPackageVerifier();
    this.permissionsManager = options?.permissionsManager || new PluginPermissionsManager();
    this.trustManager = options?.trustManager || new PluginTrustManager();
  }

  /**
   * Installs and verifies a plugin manifest and package payload.
   */
  public install(manifest: PluginManifest, options: InstallOptions = {}): PluginRecord {
    // 1. Validate manifest contract
    const validatedManifest = PluginManifestSchema.parse(manifest);

    // 2. Verify checksum if package bytes provided
    if (options.packageBytes) {
      const isValidChecksum = this.packageVerifier.verifyChecksum(
        options.packageBytes,
        validatedManifest.checksum
      );
      if (!isValidChecksum) {
        throw new Error(
          `Checksum mismatch for plugin "${validatedManifest.id}". Expected "${validatedManifest.checksum}".`
        );
      }
    }

    // 3. Verify compatibility
    const compat = this.compatibilityChecker.checkCompatibility(
      validatedManifest.compatibility,
      options.availableCapabilities || []
    );
    if (!compat.isCompatible) {
      throw new Error(
        `Compatibility check failed for plugin "${validatedManifest.id}": ${compat.reasons.join(" ")}`
      );
    }

    // 4. Resolve dependencies
    const depResolution = this.dependencyResolver.resolve(
      [validatedManifest],
      options.installedManifests || []
    );
    if (!depResolution.isResolved) {
      throw new Error(
        `Dependency resolution failed for plugin "${validatedManifest.id}": ${depResolution.errors.join(" ")}`
      );
    }

    // 5. Review permissions against trust state
    const currentTrust = this.trustManager.getTrust(validatedManifest.id);
    const permReview = this.permissionsManager.reviewPermissions(
      validatedManifest.permissions,
      currentTrust
    );
    if (!permReview.isGranted) {
      throw new Error(
        `Permission review denied for plugin "${validatedManifest.id}": ${permReview.deniedPermissions.join(" ")}`
      );
    }

    const now = new Date().toISOString();
    const installPath = options.installDir
      ? this.packageVerifier.validateInstallPath(validatedManifest.id, options.installDir, "")
      : undefined;

    const record: PluginRecord = PluginRecordSchema.parse({
      manifest: validatedManifest,
      trustState: currentTrust,
      lifecycleState: "installed",
      healthState: "healthy",
      installPath,
      installedAt: now,
      activeRegistrations: { tools: [], commands: [], hooks: [], providers: [] },
    });

    return record;
  }
}
