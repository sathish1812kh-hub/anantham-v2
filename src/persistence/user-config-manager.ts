import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface UserConfig {
  apiKeys: Record<string, string>;
  defaultModel?: string;
  theme?: string;
  lastUpdated?: string;
  customModels?: string[];
  logoPath?: string;
  logo_path?: string;
}

/**
 * UserConfigManager handles persistent configuration for Anantham V2
 * across CLI, TUI, and Agent runtimes.
 * Stores global config in ~/.anantham/config.json and optionally syncs with project .env.
 */
export class UserConfigManager {
  private static instance: UserConfigManager;
  private readonly configDir: string;
  private readonly configPath: string;
  private config: UserConfig;

  constructor(customConfigDir?: string) {
    this.configDir = customConfigDir || path.join(os.homedir(), ".anantham");
    this.configPath = path.join(this.configDir, "config.json");
    this.config = this.readFromDisk();
  }

  public static getInstance(customConfigDir?: string): UserConfigManager {
    if (!UserConfigManager.instance || customConfigDir) {
      UserConfigManager.instance = new UserConfigManager(customConfigDir);
    }
    return UserConfigManager.instance;
  }

  private readFromDisk(): UserConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, "utf-8");
        return JSON.parse(content);
      }
    } catch {
      // Fallback on read failure
    }
    return { apiKeys: {} };
  }

  public save(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      this.config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      console.error("Warning: Failed to save ~/.anantham/config.json:", err);
    }
  }

  public getApiKey(provider: string): string | undefined {
    const key = provider.toLowerCase();
    return this.config.apiKeys[key] || process.env[`${key.toUpperCase().replace(/-/g, "_")}_API_KEY`];
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

  public removeApiKey(provider: string, workspaceDir?: string): boolean {
    const key = provider.toLowerCase();
    if (this.config.apiKeys[key]) {
      delete this.config.apiKeys[key];
      this.save();

      const envVar = `${key.toUpperCase().replace(/-/g, "_")}_API_KEY`;
      delete process.env[envVar];
      this.removeFromWorkspaceDotenv(envVar, workspaceDir || process.cwd());
      return true;
    }
    return false;
  }

  public listKeys(): Array<{ provider: string; configured: boolean; masked: string }> {
    const knownProviders = ["openrouter", "openai", "anthropic", "gemini", "groq", "deepseek", "ollama"];
    return knownProviders.map((p) => {
      const val = this.getApiKey(p);
      return {
        provider: p,
        configured: !!val,
        masked: val ? this.maskSecret(val) : "Not Set",
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
