#!/usr/bin/env node

import path from "node:path";
import { CliApplication } from "../src/cli/cli-application.js";
import { TuiApplication } from "../src/tui/tui-application.js";
import { ApiServer } from "../src/api/api-server.js";
import { type CliOutputMode } from "../src/domain/cli.js";
import { UserConfigManager } from "../src/persistence/user-config-manager.js";

async function main(): Promise<void> {
  try {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile();
    }
  } catch {}

  try {
    UserConfigManager.getInstance().syncAllToProcessEnv();
  } catch {}

  const args = process.argv.slice(2);
  let dbPath = path.join(process.cwd(), ".anantham", "anantham.db");
  let outputMode: CliOutputMode = "text";
  let executeCmd: string | undefined;
  let initialProjectId: string | undefined;
  let initialSessionId: string | undefined;
  let isTuiMode = false;
  let isServerMode = false;
  let serverPort = 3000;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--db" && args[i + 1]) {
      dbPath = args[++i]!;
    } else if (arg === "--tui") {
      isTuiMode = true;
    } else if (arg === "--server") {
      isServerMode = true;
    } else if (arg === "--port" && args[i + 1]) {
      serverPort = parseInt(args[++i]!, 10);
    } else if (arg === "--json") {
      outputMode = "json";
    } else if (arg === "--jsonl") {
      outputMode = "jsonl";
    } else if (arg === "-e" || arg === "--eval") {
      executeCmd = args[++i];
    } else if (arg === "--project" && args[i + 1]) {
      initialProjectId = args[++i];
    } else if (arg === "--session" && args[i + 1]) {
      initialSessionId = args[++i];
    } else if (arg === "--logo" && args[i + 1]) {
      const customLogo = args[++i]!;
      process.env.ANANTHAM_LOGO_PATH = customLogo;
      try {
        UserConfigManager.getInstance().setLogoPath(customLogo);
      } catch {}
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Anantham V2 — Programmable AI Agent Operating Environment
Usage: anantham [options] [command]

Options:
  --db <path>       Custom SQLite database path
  --tui             Launch Terminal User Interface
  --server          Launch HTTP REST API server
  --port <number>   Port for REST API server (default: 3000)
  --json            Output in JSON format
  --jsonl           Output in JSON Lines format
  -e, --eval <cmd>  Execute single slash command and exit
  --project <id>    Initial active project ID
  --session <id>    Initial active session ID
  --logo <path>     Custom logo image path (PNG/Sixel/ANSI)
  -h, --help        Show this help message
  -v, --version     Show runtime version
      `);
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("2.0.5");
      process.exit(0);
    } else if (!arg.startsWith("-") && !executeCmd) {
      executeCmd = args.slice(i).join(" ");
      break;
    }
  }

  if (isServerMode) {
    const server = new ApiServer({ dbPath });
    await server.initialize();
    const info = await server.listen(serverPort);
    console.log(`Anantham V2 REST API Server running at ${info.url}`);
    console.log(`OpenAPI specification available at ${info.url}/openapi.json`);
    return;
  }

  if (isTuiMode) {
    const tuiApp = new TuiApplication({
      dbPath,
      initialProjectId,
      initialSessionId,
    });
    await tuiApp.initialize();
    try {
      await tuiApp.start();
    } finally {
      tuiApp.shutdown();
    }
    return;
  }

  const app = new CliApplication({
    dbPath,
    outputMode,
    initialProjectId,
    initialSessionId,
  });

  await app.initialize();

  try {
    if (executeCmd) {
      const result = await app.executeSingleCommand(executeCmd);
      const rendered = app.renderer.renderResult(result);
      console.log(rendered);
      process.exit(result.success ? 0 : 1);
    } else {
      console.log("Anantham V2 — Programmable AI Agent Operating Environment");
      console.log("Type /help for available commands or /exit to quit.\n");
      await app.startInteractive();
    }
  } finally {
    app.shutdown();
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("Fatal CLI Error:", err);
    process.exit(1);
  });
}
