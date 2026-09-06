import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  OpenRouterKeyMetadata,
  OpenRouterKeyValidationResult,
  KeyValidationOptions,
  validateOpenRouterKey,
} from "./openrouter-key-validator.js";

export interface StoredKeyMetadata extends OpenRouterKeyMetadata {
  validatedAt?: string;
}

export interface UserConfig {
  apiKeys: Record<string, string>;
  keyMetadata?: Record<string, StoredKeyMetadata>;
  defaultModel?: string;
  theme?: string;
  lastUpdated?: string;
  customModels?: string[];
  logoPath?: string;
  logo_path?: string;
}

export interface ConfiguredKeyInfo {
  provider: string;
  configured: boolean;
  masked: string;
  metadata?: StoredKeyMetadata;
}

/**
 * UserConfigManager handles persistent configuration for Anantham V2 / Antigravity CLI
 * across CLI, TUI, and Agent runtimes.
 * Supports dual-path hierarchy: ~/.antigravity/config.json primary with ~/.anantham/config.json fallback.
 */
export class UserConfigManager {
  private static instance: UserConfigManager | undefined;
  private readonly configDir: string;
  private readonly configPath: string;
  private readonly fallbackConfigDir: string;
  private readonly fallbackConfigPath: string;
  private config: UserConfig;

  constructor(customConfigDir?: string, customFallbackDir?: string) {
    this.configDir = customConfigDir || path.join(os.homedir(), ".antigravity");
    this.configPath = path.join(this.configDir, "config.json");
    this.fallbackConfigDir = customFallbackDir || (customConfigDir ? customConfigDir : path.join(os.homedir(), ".anantham"));
    this.fallbackConfigPath = path.join(this.fallbackConfigDir, "config.json");
    this.config = this.readFromDisk();
  }

  public static getInstance(customConfigDir?: string, customFallbackDir?: string): UserConfigManager {
    if (!UserConfigManager.instance || customConfigDir !== undefined || customFallbackDir !== undefined) {
      UserConfigManager.instance = new UserConfigManager(customConfigDir, customFallbackDir);
    }
    return UserConfigManager.instance;
  }

  public static resetInstance(): void {
    UserConfigManager.instance = undefined;
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public getFallbackConfigDir(): string {
    return this.fallbackConfigDir;
  }

  public getFallbackConfigPath(): string {
    return this.fallbackConfigPath;
  }

  private readFromDisk(): UserConfig {
    // 1. Primary path (~/.antigravity/config.json or custom)
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object") {
          return {
            apiKeys: parsed.apiKeys || {},
            keyMetadata: parsed.keyMetadata || {},
            defaultModel: parsed.defaultModel,
            theme: parsed.theme,
            lastUpdated: parsed.lastUpdated,
            customModels: parsed.customModels,
            logoPath: parsed.logoPath,
            logo_path: parsed.logo_path,
          };
        }
      }
    } catch {
      // Primary read failed, attempt fallback
    }

    // 2. Fallback path (~/.anantham/config.json)
    try {
      if (this.fallbackConfigPath !== this.configPath && fs.existsSync(this.fallbackConfigPath)) {
        const content = fs.readFileSync(this.fallbackConfigPath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object") {
          return {
            apiKeys: parsed.apiKeys || {},
            keyMetadata: parsed.keyMetadata || {},
            defaultModel: parsed.defaultModel,
            theme: parsed.theme,
            lastUpdated: parsed.lastUpdated,
            customModels: parsed.customModels,
            logoPath: parsed.logoPath,
            logo_path: parsed.logo_path,
          };
        }
      }
    } catch {
      // Fallback read failed
    }

    return { apiKeys: {}, keyMetadata: {} };
  }

  public save(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      this.config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      console.error(`Warning: Failed to save ${this.configPath}:`, err);
    }
  }

  public getApiKey(provider: string): string | undefined {
    const key = provider.toLowerCase();
    return this.config.apiKeys[key] || process.env[`${key.toUpperCase().replace(/-/g, "_")}_API_KEY`];
  }

  public getKeyMetadata(provider: string): StoredKeyMetadata | undefined {
    const key = provider.toLowerCase();
    return this.config.keyMetadata?.[key];
  }

  public setKeyMetadata(provider: string, metadata: OpenRouterKeyMetadata): void {
    const key = provider.toLowerCase();
    if (!this.config.keyMetadata) {
      this.config.keyMetadata = {};
    }
    this.config.keyMetadata[key] = {
      ...metadata,
      validatedAt: new Date().toISOString(),
    };
    this.save();
  }

  public setApiKey(provider: string, apiKey: string, workspaceDir?: string): void {
    const key = provider.toLowerCase();
    this.config.apiKeys[key] = apiKey;
    this.save();

    // Sync to process.env immediately
    const envVar = `${key.toUpperCase().replace(/-/g, "_")}_API_KEY`;
    process.env[envVar] = apiKey;

    // Sync to workspace .env if directory provided or current directory
    this.syncToWorkspaceDotenv(envVar, apiKey, workspaceDir || process.cwd());
  }

  /**
   * Validates key via handshake (if OpenRouter) before persisting credentials.
   */
  public async validateAndSetApiKey(
    provider: string,
    apiKey: string,
    workspaceDir?: string,
    options?: KeyValidationOptions
  ): Promise<OpenRouterKeyValidationResult> {
    const key = provider.toLowerCase();
    const trimmed = apiKey ? apiKey.trim() : "";
    if (!trimmed) {
      return {
        valid: false,
        error: "API key cannot be empty",
      };
    }

    if (key === "openrouter") {
      const validation = await validateOpenRouterKey(trimmed, options);
      if (!validation.valid) {
        return validation;
      }
      this.setApiKey(provider, trimmed, workspaceDir);
      if (validation.metadata) {
        this.setKeyMetadata(provider, validation.metadata);
      }
      return validation;
    }

    // Generic provider
    this.setApiKey(provider, trimmed, workspaceDir);
    return { valid: true };
  }

  public removeApiKey(provider: string, workspaceDir?: string): boolean {
    const key = provider.toLowerCase();
    let removed = false;
    if (this.config.apiKeys[key]) {
      delete this.config.apiKeys[key];
      removed = true;
    }
    if (this.config.keyMetadata?.[key]) {
      delete this.config.keyMetadata[key];
      removed = true;
    }
    if (removed) {
      this.save();

      const envVar = `${key.toUpperCase().replace(/-/g, "_")}_API_KEY`;
      delete process.env[envVar];
      this.removeFromWorkspaceDotenv(envVar, workspaceDir || process.cwd());
      return true;
    }
    return false;
  }

  public listKeys(): ConfiguredKeyInfo[] {
    const knownProviders = ["openrouter", "openai", "anthropic", "gemini", "groq", "deepseek", "ollama"];
    return knownProviders.map((p) => {
      const val = this.getApiKey(p);
      const meta = this.getKeyMetadata(p);
      return {
        provider: p,
        configured: !!val,
        masked: val ? this.maskSecret(val) : "Not Set",
        ...(meta ? { metadata: meta } : {}),
      };
    });
  }

  public getDefaultModel(): string {
    if (this.config.defaultModel) {
      return this.config.defaultModel;
    }
    // If OpenRouter is configured, default to Claude 3.5 Sonnet on OpenRouter
    if (this.getApiKey("openrouter")) {
      return "openrouter/anthropic/claude-3.5-sonnet";
    }
    return "gemini-2.5-pro";
  }

  public setDefaultModel(modelId: string): void {
    this.config.defaultModel = modelId;
    this.save();
  }

  public getCustomModels(): string[] {
    return this.config.customModels || [];
  }

  public addCustomModel(modelId: string): void {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    if (!this.config.customModels) {
      this.config.customModels = [];
    }
    if (!this.config.customModels.includes(trimmed)) {
      this.config.customModels.push(trimmed);
      this.save();
    }
  }

  public removeCustomModel(modelId: string): boolean {
    if (!this.config.customModels) return false;
    const trimmed = modelId.trim();
    const initialLen = this.config.customModels.length;
    this.config.customModels = this.config.customModels.filter((m) => m !== trimmed);
    if (this.config.customModels.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public getLogoPath(): string | undefined {
    return this.config.logoPath || this.config.logo_path;
  }

  public setLogoPath(logoPath: string): void {
    const trimmed = logoPath.trim();
    if (!trimmed) {
      delete this.config.logoPath;
      delete this.config.logo_path;
    } else {
      this.config.logoPath = trimmed;
      this.config.logo_path = trimmed;
    }
    this.save();
  }

  public syncAllToProcessEnv(): void {
    for (const [provider, apiKey] of Object.entries(this.config.apiKeys)) {
      const envVar = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
      if (!process.env[envVar] && apiKey) {
        process.env[envVar] = apiKey;
      }
    }
  }

  private maskSecret(secret: string): string {
    if (!secret || secret.length < 8) return "****";
    return `${secret.slice(0, 3)}...${secret.slice(-4)}`;
  }

  private syncToWorkspaceDotenv(envVar: string, value: string, workspaceDir: string): void {
    try {
      const dotenvPath = path.join(workspaceDir, ".env");
      let content = "";
      if (fs.existsSync(dotenvPath)) {
        content = fs.readFileSync(dotenvPath, "utf-8");
      }

      const regex = new RegExp(`^${envVar}=.*$`, "m");
      if (regex.test(content)) {
        content = content.replace(regex, `${envVar}=${value}`);
      } else {
        content = content ? `${content.trimEnd()}\n${envVar}=${value}\n` : `${envVar}=${value}\n`;
      }
      fs.writeFileSync(dotenvPath, content, "utf-8");
    } catch {
      // Non-fatal if workspace .env is unwritable
    }
  }

  private removeFromWorkspaceDotenv(envVar: string, workspaceDir: string): void {
    try {
      const dotenvPath = path.join(workspaceDir, ".env");
      if (fs.existsSync(dotenvPath)) {
        const content = fs.readFileSync(dotenvPath, "utf-8");
        const regex = new RegExp(`^${envVar}=.*$\n?`, "m");
        const updated = content.replace(regex, "");
        fs.writeFileSync(dotenvPath, updated, "utf-8");
      }
    } catch {
      // Non-fatal
    }
  }
}
