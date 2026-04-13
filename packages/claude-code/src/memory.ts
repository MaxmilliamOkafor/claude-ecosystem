import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";

/**
 * Lightweight persistent memory. Claude Code reads a project-local
 * `.claude-code-memory.md` on start-up and injects it into the system prompt so
 * repeated runs "remember" project conventions the user (or the agent) wrote
 * down explicitly.
 */

const HEADER = "# Claude Code Project Memory\n\nFacts and conventions the assistant should remember across sessions.\n\n";

export function readMemory(cfg: Config): string {
  if (!fs.existsSync(cfg.memoryFile)) return "";
  return fs.readFileSync(cfg.memoryFile, "utf8");
}

export function appendMemory(cfg: Config, note: string): void {
  const dir = path.dirname(cfg.memoryFile);
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.existsSync(cfg.memoryFile) ? fs.readFileSync(cfg.memoryFile, "utf8") : HEADER;
  const stamped = `- ${new Date().toISOString().slice(0, 10)}: ${note.trim()}\n`;
  fs.writeFileSync(cfg.memoryFile, existing + stamped);
}

export function clearMemory(cfg: Config): void {
  if (fs.existsSync(cfg.memoryFile)) fs.unlinkSync(cfg.memoryFile);
}
