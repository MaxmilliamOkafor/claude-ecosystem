import { Router } from "express";
import crypto from "node:crypto";
import { db, type SessionRow } from "../db.js";
import { DEFAULT_MODEL_ID } from "@claude-eco/shared";

export const sessionsRouter = Router();

sessionsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT id, title, model, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 100")
    .all();
  res.json(rows);
});

sessionsRouter.post("/", (req, res) => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = (req.body?.title as string) || "Untitled";
  const model = (req.body?.model as string) || DEFAULT_MODEL_ID;
  db.prepare(
    "INSERT INTO sessions(id,title,model,created_at,updated_at,messages_json) VALUES (?,?,?,?,?,?)"
  ).run(id, title, model, now, now, "[]");
  res.json({ id, title, model, created_at: now, updated_at: now, messages: [] });
});

sessionsRouter.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id) as SessionRow | undefined;
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json({ ...row, messages: JSON.parse(row.messages_json) });
});

sessionsRouter.patch("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id) as SessionRow | undefined;
  if (!row) return res.status(404).json({ error: "not_found" });
  const title = (req.body?.title as string) ?? row.title;
  const model = (req.body?.model as string) ?? row.model;
  db.prepare("UPDATE sessions SET title=?, model=?, updated_at=? WHERE id=?").run(
    title,
    model,
    new Date().toISOString(),
    row.id
  );
  res.json({ ok: true });
});

sessionsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM tasks WHERE session_id = ?").run(req.params.id);
  db.prepare("DELETE FROM logs WHERE session_id = ?").run(req.params.id);
  res.json({ ok: true });
});

export function persistMessages(sessionId: string, messages: unknown): void {
  db.prepare("UPDATE sessions SET messages_json=?, updated_at=? WHERE id=?").run(
    JSON.stringify(messages),
    new Date().toISOString(),
    sessionId
  );
}

export function getSession(sessionId: string): (SessionRow & { messages: unknown[] }) | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id=?").get(sessionId) as SessionRow | undefined;
  if (!row) return null;
  return { ...row, messages: JSON.parse(row.messages_json) as unknown[] };
}
