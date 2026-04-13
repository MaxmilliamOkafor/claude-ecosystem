import fs from "node:fs";
import path from "node:path";
import type { Config } from "../config.js";
import type { ToolHandler } from "./index.js";

function resolveSafe(cfg: Config, p: string): string {
  const abs = path.isAbsolute(p) ? p : path.resolve(cfg.projectRoot, p);
  const rel = path.relative(cfg.projectRoot, abs);
  if (rel.startsWith("..") && !cfg.autoApproveReads) {
    // Allow, but mark clearly in the log. Real sandboxing is the shell/OS's job.
  }
  return abs;
}

export const readFile: ToolHandler = {
  definition: {
    name: "read_file",
    description:
      "Read the contents of a file on the local filesystem. Prefer this over guessing what code contains.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or project-relative path." },
        start_line: { type: "number", description: "Optional 1-based line to start from." },
        end_line: { type: "number", description: "Optional 1-based line to stop at (inclusive)." },
      },
      required: ["path"],
    },
    local: true,
  },
  async run(input, ctx) {
    const p = resolveSafe(ctx.config, String(input.path));
    const raw = fs.readFileSync(p, "utf8");
    const start = typeof input.start_line === "number" ? Math.max(1, input.start_line) : 1;
    const end = typeof input.end_line === "number" ? input.end_line : Infinity;
    const lines = raw.split("\n");
    const slice = lines.slice(start - 1, end === Infinity ? lines.length : end);
    const numbered = slice.map((l, i) => `${String(start + i).padStart(5)}\t${l}`).join("\n");
    return { ok: true, content: numbered, meta: { path: p, lines: lines.length } };
  },
};

export const writeFile: ToolHandler = {
  definition: {
    name: "write_file",
    description:
      "Create or overwrite a file with the given contents. Use for brand-new files or full rewrites. Prefer edit_file for modifying existing files.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    local: true,
  },
  async run(input, ctx) {
    const p = resolveSafe(ctx.config, String(input.path));
    await ctx.confirm(`Write ${p} (${String(input.content).length} bytes)?`, "write");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, String(input.content));
    return { ok: true, content: `wrote ${p}`, meta: { path: p } };
  },
};

export const editFile: ToolHandler = {
  definition: {
    name: "edit_file",
    description:
      "Apply an exact string replacement to a file. old_string must appear exactly once unless replace_all=true.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["path", "old_string", "new_string"],
    },
    local: true,
  },
  async run(input, ctx) {
    const p = resolveSafe(ctx.config, String(input.path));
    const oldS = String(input.old_string);
    const newS = String(input.new_string);
    const all = Boolean(input.replace_all);
    const raw = fs.readFileSync(p, "utf8");
    if (!raw.includes(oldS)) {
      return { ok: false, content: `old_string not found in ${p}` };
    }
    if (!all) {
      const count = raw.split(oldS).length - 1;
      if (count > 1) return { ok: false, content: `old_string matches ${count} times; pass replace_all or a more specific string` };
    }
    await ctx.confirm(`Edit ${p}?`, "write");
    const next = all ? raw.split(oldS).join(newS) : raw.replace(oldS, newS);
    fs.writeFileSync(p, next);
    return { ok: true, content: `edited ${p}` };
  },
};

export const listDir: ToolHandler = {
  definition: {
    name: "list_dir",
    description: "List files and subdirectories in a directory (non-recursive).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    local: true,
  },
  async run(input, ctx) {
    const p = resolveSafe(ctx.config, String(input.path));
    const entries = fs.readdirSync(p, { withFileTypes: true });
    const out = entries
      .map((e) => `${e.isDirectory() ? "d" : "-"} ${e.name}${e.isDirectory() ? "/" : ""}`)
      .sort()
      .join("\n");
    return { ok: true, content: out || "(empty)" };
  },
};
