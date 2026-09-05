#!/usr/bin/env node

import path from "node:path";
import { CliApplication } from "../cli/cli-application.js";
import { TuiApplication } from "../tui/tui-application.js";
import { ApiServer } from "../api/api-server.js";
import { type CliOutputMode } from "../domain/cli.js";
import { UserConfigManager } from "../persistence/user-config-manager.js";

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
  -h, --help        Show this help message
  -v, --version     Show runtime version
      `);
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("2.0.1");
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
    return;
  }

  if (isTuiMode) {
    const tui = new TuiApplication({ dbPath });
    await tui.initialize();
    await tui.start();
    return;
  }

  const cli = new CliApplication({
    dbPath,
    outputMode,
    initialProjectId,
    initialSessionId,
  });

  await cli.initialize();

  if (executeCmd) {
    const result = await cli.executeSingleCommand(executeCmd);
    const output = cli.renderer.renderResult(result);
    if (output) {
      console.log(output);
    }
    cli.shutdown();
  } else {
    await cli.startInteractive();
  }
}

main().catch((err) => {
  console.error("Fatal Anantham CLI Error:", err);
  process.exit(1);
});
