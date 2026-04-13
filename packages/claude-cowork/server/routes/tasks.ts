import { Router } from "express";
import crypto from "node:crypto";
import { db, type TaskRow } from "../db.js";

export const tasksRouter = Router();

tasksRouter.get("/", (req, res) => {
  const sid = req.query.session_id as string | undefined;
  const rows = sid
    ? db.prepare("SELECT * FROM tasks WHERE session_id=? ORDER BY created_at ASC").all(sid)
    : db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 200").all();
  res.json(rows);
});

tasksRouter.post("/", (req, res) => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = String(req.body?.title ?? "").trim();
  const sessionId = String(req.body?.session_id ?? "");
  if (!title || !sessionId) return res.status(400).json({ error: "title and session_id are required" });
  db.prepare(
    "INSERT INTO tasks(id,session_id,title,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)"
  ).run(id, sessionId, title, "pending", req.body?.notes ?? null, now, now);
  res.json({ id, session_id: sessionId, title, status: "pending", notes: req.body?.notes ?? null });
});

tasksRouter.patch("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM tasks WHERE id=?").get(req.params.id) as TaskRow | undefined;
  if (!row) return res.status(404).json({ error: "not_found" });
  const status = (req.body?.status as TaskRow["status"]) ?? row.status;
  const title = (req.body?.title as string) ?? row.title;
  const notes = (req.body?.notes as string | null) ?? row.notes;
  db.prepare("UPDATE tasks SET status=?, title=?, notes=?, updated_at=? WHERE id=?").run(
    status,
    title,
    notes,
    new Date().toISOString(),
    row.id
  );
  res.json({ ok: true });
});

tasksRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM tasks WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
