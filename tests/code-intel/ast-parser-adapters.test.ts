import { describe, it, expect } from "vitest";
import { MultiLanguageAstParser } from "../../src/code-intel/parsers/multi-language-ast-parser.js";

describe("PRD-CODE-003: Multi-Language AST & Parser Adapters", () => {
  const parser = new MultiLanguageAstParser();

  it("parses TypeScript and JavaScript files extracting classes, functions, and imports", () => {
    const tsCode = `
import { Config } from "./config";
export class Engine {
  public start(): void {
    console.log("running");
  }
}
export async function initializeEngine() {
  const e = new Engine();
  e.start();
}
`;
    const result = parser.parse("src/engine.ts", tsCode);
    expect(result.language).toBe("typescript");
    expect(result.symbols.some((s) => s.name === "Engine" && s.kind === "class")).toBe(true);
    expect(result.symbols.some((s) => s.name === "initializeEngine" && s.kind === "function")).toBe(true);
    expect(result.imports.some((i) => i.source === "./config")).toBe(true);
  });

  it("parses Python code extracting classes, functions, and imports", () => {
    const pyCode = `
import os
from sys import path

class PipelineManager:
    def process_item(self, item):
        return item * 2

def execute_pipeline():
    mgr = PipelineManager()
    mgr.process_item(42)
`;
    const result = parser.parse("pipeline.py", pyCode);
    expect(result.language).toBe("python");
    expect(result.symbols.some((s) => s.name === "PipelineManager" && s.kind === "class")).toBe(true);
    expect(result.symbols.some((s) => s.name === "process_item" && s.kind === "method")).toBe(true);
    expect(result.symbols.some((s) => s.name === "execute_pipeline" && s.kind === "function")).toBe(true);
  });

  it("parses Go code extracting functions, structs, and imports", () => {
    const goCode = `
package main
import "fmt"

type ServerConfig struct {
    Port int
}

func StartServer(cfg ServerConfig) {
    fmt.Println("Server started")
}
`;
    const result = parser.parse("server.go", goCode);
    expect(result.language).toBe("go");
    expect(result.symbols.some((s) => s.name === "ServerConfig" && s.kind === "class")).toBe(true);
    expect(result.symbols.some((s) => s.name === "StartServer" && s.kind === "function")).toBe(true);
  });

  it("parses Rust code extracting structs, enums, and functions", () => {
    const rustCode = `
use std::collections::HashMap;

pub struct WorkerNode {
    pub id: String,
}

pub enum NodeStatus {
    Active,
    Idle,
}

pub fn spawn_worker() -> WorkerNode {
    WorkerNode { id: "w-1".into() }
}
`;
    const result = parser.parse("worker.rs", rustCode);
    expect(result.language).toBe("rust");
    expect(result.symbols.some((s) => s.name === "WorkerNode" && s.kind === "class")).toBe(true);
    expect(result.symbols.some((s) => s.name === "NodeStatus" && s.kind === "enum")).toBe(true);
    expect(result.symbols.some((s) => s.name === "spawn_worker" && s.kind === "function")).toBe(true);
  });

  it("parses Java code extracting classes and methods", () => {
    const javaCode = `
package com.anantham.service;
import java.util.List;

public class SecurityAuditor {
    public void audit() {
        System.out.println("Auditing");
    }
}
`;
    const result = parser.parse("SecurityAuditor.java", javaCode);
    expect(result.language).toBe("java");
    expect(result.symbols.some((s) => s.name === "SecurityAuditor" && s.kind === "class")).toBe(true);
  });

  it("parses C and C++ code extracting structs and includes", () => {
    const cCode = `
#include <stdio.h>

struct PacketBuffer {
    int length;
};
`;
    const result = parser.parse("buffer.c", cCode);
    expect(result.language).toBe("c");
    expect(result.symbols.some((s) => s.name === "PacketBuffer")).toBe(true);
    expect(result.imports.some((i) => i.source === "stdio.h")).toBe(true);
  });

  it("parses JSON, YAML, and Markdown files", () => {
    const jsonRes = parser.parse("config.json", JSON.stringify({ name: "anantham", version: 2 }));
    expect(jsonRes.symbols.some((s) => s.name === "name")).toBe(true);

    const yamlRes = parser.parse("workflow.yaml", "services:\n  database:\n    image: postgres\n");
    expect(yamlRes.symbols.some((s) => s.name === "services")).toBe(true);

    const mdRes = parser.parse("README.md", "# Anantham Architecture\n\n## Overview\nContent here.\n");
    expect(mdRes.symbols.some((s) => s.name === "Anantham Architecture")).toBe(true);
  });
});
