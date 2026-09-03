import { describe, it, expect } from "vitest";
import { CodeIndexEngine } from "../../src/code-intel/code-index-engine.js";
import { IncrementalIndexer } from "../../src/code-intel/incremental-indexer.js";

describe("PRD-CODE-005: Incremental Code Indexing", () => {
  it("performs incremental hash comparison and tracks affected symbols without full re-indexing", async () => {
    const codeIndex = new CodeIndexEngine();
    const indexer = new IncrementalIndexer(codeIndex);

    const filePathA = "/workspace/user.ts";
    const contentV1 = `
export class User {
  constructor(public id: string) {}
}
`;
    // First index
    const res1 = await indexer.updateFile(filePathA, contentV1);
    expect(res1.changed).toBe(true);
    expect(res1.newSha256).toBeDefined();
    expect(res1.affectedSymbols).toContain("User");

    // Re-indexing identical content produces no changes
    const resNoChange = await indexer.updateFile(filePathA, contentV1);
    expect(resNoChange.changed).toBe(false);
    expect(resNoChange.affectedSymbols.length).toBe(0);

    // Index a dependent file
    const filePathB = "/workspace/service.ts";
    const contentB = `
import { User } from "./user";
export class UserService {}
`;
    await indexer.updateFile(filePathB, contentB);

    // Modify file A: add a new symbol
    const contentV2 = `
export class User {
  constructor(public id: string) {}
}
export class UserProfile {}
`;
    const res2 = await indexer.updateFile(filePathA, contentV2);
    expect(res2.changed).toBe(true);
    expect(res2.affectedSymbols).toContain("UserProfile");
    expect(res2.affectedDependents).toContain(filePathB);

    // File removal
    const affectedOnRemove = await indexer.removeFile(filePathA);
    expect(affectedOnRemove).toContain(filePathB);
  });
});
