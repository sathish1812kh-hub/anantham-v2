import type { ContentObject, ContentRepresentation } from "../domain/content.js";
import { ContentObjectSchema } from "../domain/content.js";

export interface SecretFinding {
  type: "openai-api-key" | "github-pat" | "aws-access-key" | "private-key" | "bearer-token" | "db-credential";
  matchedPattern: string;
  index: number;
}

export interface SecretDetectionResult {
  hasSecrets: boolean;
  findings: SecretFinding[];
}

export class ContentSanitizer {
  private static readonly SECRET_PATTERNS: Array<{
    type: SecretFinding["type"];
    regex: RegExp;
    redaction: string;
  }> = [
    {
      type: "private-key",
      regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      redaction: "[REDACTED_PRIVATE_KEY]",
    },
    {
      type: "openai-api-key",
      regex: /\bsk-[a-zA-Z0-9_\-]{20,}\b/g,
      redaction: "[REDACTED_OPENAI_API_KEY]",
    },
    {
      type: "github-pat",
      regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b|\bgithub_pat_[a-zA-Z0-9_]{40,}\b/g,
      redaction: "[REDACTED_GITHUB_PAT]",
    },
    {
      type: "aws-access-key",
      regex: /\bAKIA[0-9A-Z]{16}\b/g,
      redaction: "[REDACTED_AWS_ACCESS_KEY]",
    },
    {
      type: "bearer-token",
      regex: /\bBearer\s+[a-zA-Z0-9_\-\.]{25,}\b/gi,
      redaction: "Bearer [REDACTED_BEARER_TOKEN]",
    },
    {
      type: "db-credential",
      regex: /\b(?:postgres|postgresql|mongodb|mysql|redis):\/\/[a-zA-Z0-9_\-]+:([^\s@]+)@/g,
      redaction: "[REDACTED_DB_CREDENTIAL]",
    },
  ];

  /**
   * Scans text for exposed credentials and secrets.
   * PRD Part 3 Section 139.
   */
  public static scanSecrets(text: string): SecretDetectionResult {
    if (!text) return { hasSecrets: false, findings: [] };

    const findings: SecretFinding[] = [];

    for (const { type, regex } of ContentSanitizer.SECRET_PATTERNS) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        findings.push({
          type,
          matchedPattern: match[0].slice(0, 8) + "...",
          index: match.index,
        });
      }
    }

    return {
      hasSecrets: findings.length > 0,
      findings,
    };
  }

  /**
   * Redacts exposed credentials and secrets from text.
   */
  public static redactSecrets(text: string): { redactedText: string; findings: SecretFinding[] } {
    if (!text) return { redactedText: "", findings: [] };

    let redactedText = text;
    const findings: SecretFinding[] = [];

    for (const { type, regex, redaction } of ContentSanitizer.SECRET_PATTERNS) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        findings.push({
          type,
          matchedPattern: match[0].slice(0, 8) + "...",
          index: match.index,
        });
      }
      redactedText = redactedText.replace(regex, redaction);
    }

    return {
      redactedText,
      findings,
    };
  }

  /**
   * Sanitizes all textual representations within a ContentObject.
   * If secrets are found, replaces text with redacted version and escalates sensitivity.
   */
  public static sanitizeContentObject(content: ContentObject): {
    sanitized: ContentObject;
    secretsFound: boolean;
    findingsCount: number;
  } {
    let totalFindings = 0;
    const sanitizedRepresentations: ContentRepresentation[] = [];

    for (const rep of content.representations) {
      if (rep.type === "text" || rep.type === "markdown" || rep.type === "transcript") {
        if (typeof rep.data === "string") {
          const { redactedText, findings } = ContentSanitizer.redactSecrets(rep.data);
          totalFindings += findings.length;
          sanitizedRepresentations.push({
            ...rep,
            data: redactedText,
          });
          continue;
        }
      }
      sanitizedRepresentations.push(rep);
    }

    const secretsFound = totalFindings > 0;
    const sensitivity = secretsFound
      ? (content.security.sensitivity === "secret" ? "secret" : "sensitive")
      : content.security.sensitivity;

    const sanitized: ContentObject = {
      ...content,
      representations: sanitizedRepresentations,
      security: {
        ...content.security,
        sensitivity,
        scanned: true,
        scanVersion: "2.0.0",
      },
      updatedAt: new Date().toISOString(),
    };

    return {
      sanitized: Object.freeze(ContentObjectSchema.parse(sanitized)),
      secretsFound,
      findingsCount: totalFindings,
    };
  }
}
