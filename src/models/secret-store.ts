/**
 * SecretStore abstraction for OS/in-memory encrypted key storage.
 * Critical Invariant: Raw secrets must never leave this boundary except to the ProviderAdapter.
 */
export interface SecretStore {
  getSecret(credentialId: string): Promise<string | undefined>;
  setSecret(credentialId: string, secret: string): Promise<void>;
  deleteSecret(credentialId: string): Promise<boolean>;
  hasSecret(credentialId: string): Promise<boolean>;
}

export function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) {
    return "****";
  }
  const prefix = secret.slice(0, 3);
  const suffix = secret.slice(-4);
  return `${prefix}...${suffix}`;
}

export class InMemorySecretStore implements SecretStore {
  private secrets: Map<string, string> = new Map();

  public async getSecret(credentialId: string): Promise<string | undefined> {
    return this.secrets.get(credentialId);
  }

  public async setSecret(credentialId: string, secret: string): Promise<void> {
    if (!secret || typeof secret !== "string") {
      throw new Error("Secret must be a non-empty string");
    }
    this.secrets.set(credentialId, secret);
  }

  public async deleteSecret(credentialId: string): Promise<boolean> {
    return this.secrets.delete(credentialId);
  }

  public async hasSecret(credentialId: string): Promise<boolean> {
    return this.secrets.has(credentialId);
  }
}
