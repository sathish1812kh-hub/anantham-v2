import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";

describe("SqliteEngine", () => {
  let engine: SqliteEngine;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
  });

  afterEach(() => {
    engine.close();
  });

  it("opens in-memory database and enforces foreign keys", () => {
    expect(engine.isOpen()).toBe(true);
    const result = engine.integrityCheck();
    expect(result.ok).toBe(true);
    expect(result.messages).toEqual(["ok"]);
  });

  it("executes successful transaction and commits changes", () => {
    engine.raw.exec("CREATE TABLE items (id TEXT PRIMARY KEY, val TEXT);");

    const result = engine.transaction(() => {
      engine.raw.prepare("INSERT INTO items (id, val) VALUES (?, ?);").run("1", "alpha");
      engine.raw.prepare("INSERT INTO items (id, val) VALUES (?, ?);").run("2", "beta");
      return "done";
    });

    expect(result).toBe("done");

    const rows = engine.raw.prepare("SELECT * FROM items ORDER BY id ASC;").all() as Array<{ id: string; val: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.val).toBe("alpha");
    expect(rows[1]?.val).toBe("beta");
  });

  it("rolls back transaction automatically on error", () => {
    engine.raw.exec("CREATE TABLE items (id TEXT PRIMARY KEY, val TEXT);");

    expect(() => {
      engine.transaction(() => {
        engine.raw.prepare("INSERT INTO items (id, val) VALUES (?, ?);").run("1", "alpha");
        throw new Error("Simulated crash mid-transaction");
      });
    }).toThrow("Simulated crash mid-transaction");

    const rows = engine.raw.prepare("SELECT * FROM items;").all();
    expect(rows).toHaveLength(0);
  });
});
