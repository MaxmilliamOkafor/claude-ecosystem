import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Message } from "@claude-eco/shared";
import type { Config } from "./config.js";

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  model: string;
  messages: Message[];
  log: LogEntry[];
}

export interface LogEntry {
  time: string;
  kind: "user" | "assistant" | "tool" | "system";
  text: string;
}

export function newSession(cfg: Config, title = "untitled"): Session {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title,
    model: cfg.model,
    messages: [],
    log: [],
  };
}

export function sessionPath(cfg: Config, id: string): string {
  return path.join(cfg.sessionsDir, `${id}.json`);
}

export function saveSession(cfg: Config, s: Session): void {
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(sessionPath(cfg, s.id), JSON.stringify(s, null, 2));
}

export function loadSession(cfg: Config, id: string): Session {
  const raw = fs.readFileSync(sessionPath(cfg, id), "utf8");
  return JSON.parse(raw);
}

export function listSessions(cfg: Config): Array<Pick<Session, "id" | "title" | "updatedAt" | "model">> {
  if (!fs.existsSync(cfg.sessionsDir)) return [];
  return fs
    .readdirSync(cfg.sessionsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(cfg.sessionsDir, f), "utf8")) as Session;
        return { id: s.id, title: s.title, updatedAt: s.updatedAt, model: s.model };
      } catch {
        return null;
      }
    })
    .filter((x): x is Pick<Session, "id" | "title" | "updatedAt" | "model"> => !!x)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export function appendLog(s: Session, entry: Omit<LogEntry, "time">): void {
  s.log.push({ ...entry, time: new Date().toISOString() });
}
