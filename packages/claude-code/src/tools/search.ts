import fs from "node:fs";
import path from "node:path";
import type { ToolHandler } from "./index.js";

function walk(root: string, ignore: Set<string>, out: string[], max = 20_000) {
  if (out.length >= max) return;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (ignore.has(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) walk(full, ignore, out, max);
    else out.push(full);
  }
}

const DEFAULT_IGNORE = new Set([
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
]);

export const grep: ToolHandler = {
  definition: {
    name: "grep",
    description: "Search file contents with a regex across the project. Returns matching file:line:text.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern (JavaScript syntax)." },
        glob: { type: "string", description: "Optional file extension filter e.g. 'ts' or 'py'." },
        case_insensitive: { type: "boolean" },
        max_results: { type: "number" },
      },
      required: ["pattern"],
    },
    local: true,
  },
  async run(input, ctx) {
    const pattern = String(input.pattern);
    const flags = input.case_insensitive ? "i" : "";
    const re = new RegExp(pattern, flags);
    const ext = input.glob ? String(input.glob).replace(/^\./, "") : null;
    const limit = Math.min(Number(input.max_results) || 500, 2_000);

    const files: string[] = [];
    walk(ctx.config.projectRoot, DEFAULT_IGNORE, files);

    const matches: string[] = [];
    for (const f of files) {
      if (ext && !f.endsWith(`.${ext}`)) continue;
      let txt: string;
      try {
        txt = fs.readFileSync(f, "utf8");
      } catch {
        continue;
      }
      const lines = txt.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          const rel = path.relative(ctx.config.projectRoot, f);
          matches.push(`${rel}:${i + 1}:${lines[i].slice(0, 300)}`);
          if (matches.length >= limit) break;
        }
      }
      if (matches.length >= limit) break;
    }
    return {
      ok: true,
      content: matches.length ? matches.join("\n") : "(no matches)",
      meta: { count: matches.length },
    };
  },
};

export const glob: ToolHandler = {
  definition: {
    name: "glob",
    description: "Find files by substring or extension across the project.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring or '*.ext' pattern." },
        max_results: { type: "number" },
      },
      required: ["query"],
    },
    local: true,
  },
  async run(input, ctx) {
    const q = String(input.query);
    const limit = Math.min(Number(input.max_results) || 500, 5_000);
    const extMatch = /^\*\.(\w+)$/.exec(q);
    const files: string[] = [];
    walk(ctx.config.projectRoot, DEFAULT_IGNORE, files);
    const out = files.filter((f) => {
      if (extMatch) return f.endsWith(`.${extMatch[1]}`);
      return f.includes(q);
    });
    const rel = out.slice(0, limit).map((f) => path.relative(ctx.config.projectRoot, f));
    return { ok: true, content: rel.join("\n") || "(none)", meta: { count: rel.length } };
  },
};
