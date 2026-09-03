/**
 * Live File Watcher & Index Synchronizer
 * PRD-FS-001: Live File Watching & Index Synchronization
 */

import { watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";
import type { CodeIndex } from "./types.js";
import type { IncrementalIndexer, IncrementalUpdateSummary } from "./incremental-indexer.js";

export type FileWatchEvent = "create" | "modify" | "delete" | "rename";

export interface FileChangeEvent {
  type: FileWatchEvent;
  filePath: string;
  timestamp: number;
}

export class FileWatcherSync {
  private codeIndex: CodeIndex;
  private incrementalIndexer?: IncrementalIndexer;
  private watchers: Map<string, FSWatcher> = new Map();
  private eventListeners: Array<(event: FileChangeEvent, summary?: IncrementalUpdateSummary) => void> = [];
  private debounceMap: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: { codeIndex: CodeIndex; incrementalIndexer?: IncrementalIndexer }) {
    this.codeIndex = options.codeIndex;
    this.incrementalIndexer = options.incrementalIndexer;
  }

  public onFileEvent(listener: (event: FileChangeEvent, summary?: IncrementalUpdateSummary) => void): void {
    this.eventListeners.push(listener);
  }

  public watchDirectory(dirPath: string): void {
    const absPath = resolve(dirPath);
    if (this.watchers.has(absPath)) return;

    try {
      const watcher = watch(absPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const targetPath = resolve(absPath, filename);
        this.handleFsChange(eventType === "rename" ? "modify" : "modify", targetPath);
      });
      this.watchers.set(absPath, watcher);
    } catch {
      // Graceful fallback for non-supported filesystems
    }
  }

  public async triggerManualEvent(type: FileWatchEvent, filePath: string, content?: string): Promise<IncrementalUpdateSummary | undefined> {
    const absPath = resolve(filePath);
    let summary: IncrementalUpdateSummary | undefined;

    if (type === "delete") {
      if (this.incrementalIndexer) {
        await this.incrementalIndexer.removeFile(absPath);
      } else {
        await this.codeIndex.removeFile(absPath);
      }
    } else {
      if (this.incrementalIndexer && content !== undefined) {
        summary = await this.incrementalIndexer.updateFile(absPath, content);
      } else {
        await this.codeIndex.indexFile(absPath, content);
      }
    }

    const event: FileChangeEvent = { type, filePath: absPath, timestamp: Date.now() };
    for (const listener of this.eventListeners) {
      listener(event, summary);
    }

    return summary;
  }

  public stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    for (const timer of this.debounceMap.values()) {
      clearTimeout(timer);
    }
    this.debounceMap.clear();
  }

  private handleFsChange(type: FileWatchEvent, targetPath: string): void {
    const existingTimer = this.debounceMap.get(targetPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceMap.delete(targetPath);
      await this.triggerManualEvent(type, targetPath);
    }, 100);

    this.debounceMap.set(targetPath, timer);
  }
}
