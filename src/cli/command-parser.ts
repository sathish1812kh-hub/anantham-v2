import { z } from "zod";
import { type ParsedCommand, ParsedCommandSchema } from "../domain/cli.js";

/**
 * Command Parser & Tokenizer.
 * Safely parses terminal inputs into typed commands, arguments, and options.
 * PRD Part 2 Section 170–175.
 */
export class CommandParser {
  /**
   * Format a Zod validation error into a clean, single-line human-readable string.
   */
  public static formatZodError(error: z.ZodError): string {
    const messages = error.issues.map((issue) => {
      const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      if (issue.code === "invalid_union" && Array.isArray((issue as unknown as { unionErrors?: z.ZodError[] }).unionErrors)) {
        const branchMessages = (issue as unknown as { unionErrors: z.ZodError[] }).unionErrors
          .flatMap((subErr) => (subErr.issues ?? []).map((subIssue) => subIssue.message))
          .filter(Boolean);
        if (branchMessages.length > 0) {
          return `${field}Invalid input: ${branchMessages.join(" OR ")}`;
        }
      }
      return `${field}${issue.message}`;
    });
    return `Command validation failed: ${messages.join("; ")}`;
  }

  /**
   * Parse a raw command string.
   */
  public parse(rawInput: string): ParsedCommand {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      throw new Error("Empty command input.");
    }

    // Check for control character / dangerous script abuse
    if (/[\x00-\x08\x0E-\x1F]/.test(trimmed)) {
      throw new Error("Command input contains invalid control characters.");
    }

    const tokens = this.tokenize(trimmed);
    if (tokens.length === 0) {
      throw new Error("No command tokens found.");
    }

    const firstToken = tokens[0]!;
    const isSlashCommand = firstToken.startsWith("/") || firstToken.startsWith(":");
    const rawName = isSlashCommand ? firstToken.replace(/^[/:]+/, "").toLowerCase() : firstToken.toLowerCase();
    const commandName = rawName.trim();

    if (!commandName) {
      throw new Error("Empty command input.");
    }

    const args: string[] = [];
    const options: Record<string, string | boolean | number> = {};

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i]!;

      if (token.startsWith("--")) {
        const flagBody = token.slice(2);
        if (flagBody.includes("=")) {
          const [key, ...valParts] = flagBody.split("=");
          const val = valParts.join("=");
          options[key!] = this.coerceValue(val);
        } else {
          // Check if next token is a value (not a flag starting with -, unless numeric)
          const nextToken = tokens[i + 1];
          const isValue = nextToken && (!nextToken.startsWith("-") || /^-?\d+(\.\d+)?$/.test(nextToken));
          if (isValue) {
            options[flagBody] = this.coerceValue(nextToken!);
            i++;
          } else {
            options[flagBody] = true;
          }
        }
      } else if (token.startsWith("-") && token.length > 1 && !/^-?\d+(\.\d+)?$/.test(token)) {
        const flagBody = token.slice(1);
        const nextToken = tokens[i + 1];
        const isValue = nextToken && (!nextToken.startsWith("-") || /^-?\d+(\.\d+)?$/.test(nextToken));
        if (isValue) {
          options[flagBody] = this.coerceValue(nextToken!);
          i++;
        } else {
          options[flagBody] = true;
        }
      } else {
        args.push(token);
      }
    }

    try {
      return ParsedCommandSchema.parse({
        raw: trimmed,
        name: commandName,
        args,
        options,
        isSlashCommand,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new Error(CommandParser.formatZodError(err));
      }
      throw err;
    }
  }

  /**
   * Safe tokenizer handling double and single quotes.
   */
  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inDoubleQuotes = false;
    let inSingleQuotes = false;
    let isEscaped = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i]!;

      if (isEscaped) {
        current += char;
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === '"' && !inSingleQuotes) {
        inDoubleQuotes = !inDoubleQuotes;
        continue;
      }

      if (char === "'" && !inDoubleQuotes) {
        inSingleQuotes = !inSingleQuotes;
        continue;
      }

      if (/\s/.test(char) && !inDoubleQuotes && !inSingleQuotes) {
        if (current.length > 0) {
          tokens.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (inDoubleQuotes || inSingleQuotes) {
      throw new Error("Unterminated quoted string in command input.");
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }

  private coerceValue(val: string): string | boolean | number {
    if (val.toLowerCase() === "true") return true;
    if (val.toLowerCase() === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(val)) {
      const num = Number(val);
      if (!isNaN(num)) return num;
    }
    return val;
  }
}
