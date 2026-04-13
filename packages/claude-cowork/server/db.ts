import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dir = process.env.COWORK_SESSIONS_DIR ?? path.resolve(process.cwd(), ".sessions");
fs.mkdirSync(dir, { recursive: true });
const dbFile = path.join(dir, "cowork.sqlite");

export const db = new Database(dbFile);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT,
  created_at TEXT,
  updated_at TEXT,
  messages_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  title TEXT,
  status TEXT CHECK(status IN ('pending','in_progress','completed','failed')) DEFAULT 'pending',
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  kind TEXT,
  text TEXT,
  created_at TEXT
);
`);

export interface SessionRow {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  messages_json: string;
}

export interface TaskRow {
  id: string;
  session_id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogRow {
  id: number;
  session_id: string;
  kind: string;
  text: string;
  created_at: string;
}
