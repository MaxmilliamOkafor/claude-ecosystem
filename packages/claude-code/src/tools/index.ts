import type { ToolDefinition } from "@claude-eco/shared";
import type { Config } from "../config.js";
import { readFile, writeFile, editFile, listDir } from "./fs.js";
import { runShell } from "./shell.js";
import { grep, glob } from "./search.js";
import { webFetch, webSearch } from "./web.js";
import { repoMap } from "./repo.js";

export interface ToolContext {
  config: Config;
  confirm: (message: string, kind: "write" | "shell") => Promise<void>;
}

export interface ToolResult {
  ok: boolean;
  content: string;
  meta?: Record<string, unknown>;
}

export interface ToolHandler {
  definition: ToolDefinition;
  run: (input: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>;
}

export const ALL_TOOLS: ToolHandler[] = [
  repoMap,
  listDir,
  readFile,
  writeFile,
  editFile,
  grep,
  glob,
  runShell,
  webFetch,
  webSearch,
];

export function toolDefinitions(): ToolDefinition[] {
  return ALL_TOOLS.map((t) => {
    const { local, ...def } = t.definition;
    return def;
  });
}

export function findTool(name: string): ToolHandler | undefined {
  return ALL_TOOLS.find((t) => t.definition.name === name);
}
