import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { CodeIndexEngine } from "../../src/code-intel/code-index-engine.js";
import { IncrementalIndexer } from "../../src/code-intel/incremental-indexer.js";
import { FileWatcherSync, type FileChangeEvent } from "../../src/code-intel/file-watcher-sync.js";

describe("PRD-FS-001: Live File Watching & Index Synchronization", () => {
  const testDir = join(process.cwd(), ".test_file_watcher_" + Date.now());
  let codeIndex: CodeIndexEngine;
  let incrementalIndexer: IncrementalIndexer;
  let watcher: FileWatcherSync;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    codeIndex = new CodeIndexEngine();
    incrementalIndexer = new IncrementalIndexer(codeIndex);
    watcher = new FileWatcherSync({ codeIndex, incrementalIndexer });
  });

  afterEach(() => {
    watcher.stop();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("handles live file creation, modification, and deletion events and updates index state", async () => {
    const receivedEvents: FileChangeEvent[] = [];
    watcher.onFileEvent((event) => {
      receivedEvents.push(event);
    });

    const targetFile = join(testDir, "service.ts");
    const initialContent = `export class LiveService {}`;

    // 1. Trigger create/modify event
    const summary1 = await watcher.triggerManualEvent("create", targetFile, initialContent);
    expect(summary1?.changed).toBe(true);
    expect(summary1?.affectedSymbols).toContain("LiveService");
    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].type).toBe("create");

    // Check code index updated
    const symbols = await codeIndex.searchSymbols("LiveService");
    expect(symbols.length).toBe(1);

    // 2. Trigger modification
    const updatedContent = `export class LiveService {}\nexport function liveHelper() {}`;
    const summary2 = await watcher.triggerManualEvent("modify", targetFile, updatedContent);
    expect(summary2?.changed).toBe(true);
    expect(summary2?.affectedSymbols).toContain("liveHelper");

    const helperSymbols = await codeIndex.searchSymbols("liveHelper");
    expect(helperSymbols.length).toBe(1);

    // 3. Trigger deletion
    await watcher.triggerManualEvent("delete", targetFile);
    expect(receivedEvents.length).toBe(3);
    expect(receivedEvents[2].type).toBe("delete");

    const postDeleteSymbols = await codeIndex.searchSymbols("LiveService");
    expect(postDeleteSymbols.length).toBe(0);
  });
});
