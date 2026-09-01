#!/usr/bin/env node

import path from "node:path";
import { CliApplication } from "../src/cli/cli-application.js";
import { TuiApplication } from "../src/tui/tui-application.js";
import { ApiServer } from "../src/api/api-server.js";
import { type CliOutputMode } from "../src/domain/cli.js";

async function main(): Promise<void> {
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
