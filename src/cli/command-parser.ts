import { type ParsedCommand, ParsedCommandSchema } from "../domain/cli.js";

/**
 * Command Parser & Tokenizer.
 * Safely parses terminal inputs into typed commands, arguments, and options.
 * PRD Part 2 Section 170–175.
 */
export class CommandParser {
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
    const isSlashCommand = firstToken.startsWith("/");
    const commandName = isSlashCommand ? firstToken.slice(1).toLowerCase() : firstToken.toLowerCase();

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

    return ParsedCommandSchema.parse({
      raw: trimmed,
      name: commandName,
      args,
      options,
      isSlashCommand,
    });
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
