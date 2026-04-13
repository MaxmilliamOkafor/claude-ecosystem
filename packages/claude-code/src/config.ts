import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_MODEL_ID } from "@claude-eco/shared";

export interface Config {
  model: string;
  maxTokens: number;
  temperature: number;
  autoApproveReads: boolean;
  autoApproveWrites: boolean;
  autoApproveShell: boolean;
  projectRoot: string;
  sessionsDir: string;
  memoryFile: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".claude-code");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function loadConfig(overrides: Partial<Config> = {}): Config {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  let fileConfig: Partial<Config> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } catch {
      // fall through to defaults
    }
  }

  const projectRoot = overrides.projectRoot ?? fileConfig.projectRoot ?? process.cwd();
  const merged: Config = {
    model: process.env.CLAUDE_MODEL ?? fileConfig.model ?? DEFAULT_MODEL_ID,
    maxTokens: fileConfig.maxTokens ?? 4096,
    temperature: fileConfig.temperature ?? 0.2,
    autoApproveReads: fileConfig.autoApproveReads ?? true,
    autoApproveWrites: fileConfig.autoApproveWrites ?? false,
    autoApproveShell: fileConfig.autoApproveShell ?? false,
    projectRoot,
    sessionsDir: fileConfig.sessionsDir ?? path.join(CONFIG_DIR, "sessions"),
    memoryFile: fileConfig.memoryFile ?? path.join(projectRoot, ".claude-code-memory.md"),
    ...overrides,
  };

  fs.mkdirSync(merged.sessionsDir, { recursive: true });
  return merged;
}

export function saveConfig(cfg: Partial<Config>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = fs.existsSync(CONFIG_FILE)
    ? JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
    : {};
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...cfg }, null, 2));
}
