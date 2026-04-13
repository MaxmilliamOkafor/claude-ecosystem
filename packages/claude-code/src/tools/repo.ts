import fs from "node:fs";
import path from "node:path";
import type { ToolHandler } from "./index.js";

/**
 * Repo summary tool — gives the agent a fast map of the project so it knows
 * where to look without spending tool calls enumerating directories.
 */

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".venv",
  "__pycache__",
  ".sessions",
]);

function summarize(dir: string, depth: number, maxDepth: number, out: string[], prefix = "") {
  if (depth > maxDepth) return;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of sorted) {
    if (IGNORE.has(e.name)) continue;
    const line = `${prefix}${e.isDirectory() ? "📁" : "📄"} ${e.name}`;
    out.push(line);
    if (e.isDirectory()) summarize(path.join(dir, e.name), depth + 1, maxDepth, out, prefix + "  ");
  }
}

export const repoMap: ToolHandler = {
  definition: {
    name: "repo_map",
    description:
      "Return a tree-style summary of the project up to a given depth. Use this to orient yourself before diving into files.",
    input_schema: {
      type: "object",
      properties: {
        max_depth: { type: "number", description: "Default 3." },
      },
    },
    local: true,
  },
  async run(input, ctx) {
    const out: string[] = [];
    const depth = Math.min(Math.max(1, Number(input.max_depth) || 3), 6);
    summarize(ctx.config.projectRoot, 0, depth, out);
    return { ok: true, content: out.slice(0, 2_000).join("\n"), meta: { lines: out.length } };
  },
};
