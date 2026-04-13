import React, { useState } from "react";
import { api, type TaskRow } from "../api.js";

export function Tasks({
  sessionId,
  tasks,
  refresh,
}: {
  sessionId: string;
  tasks: TaskRow[];
  refresh: () => void;
}) {
  const [title, setTitle] = useState("");

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createTask(sessionId, title.trim());
    setTitle("");
    refresh();
  }
  async function cycle(t: TaskRow) {
    const order: TaskRow["status"][] = ["pending", "in_progress", "completed", "failed"];
    const next = order[(order.indexOf(t.status) + 1) % order.length];
    await api.updateTask(t.id, { status: next });
    refresh();
  }

  return (
    <aside className="tasks-panel">
      <div className="section-title">Workspace tasks</div>
      <form onSubmit={addTask}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
        />
      </form>
      <div style={{ marginTop: 12 }}>
        {tasks.length === 0 && <div className="muted">No tasks yet.</div>}
        {tasks.map((t) => (
          <div key={t.id} className="task">
            <div className="t">{t.title}</div>
            <div className="meta inline">
              <span className={`status ${t.status}`} onClick={() => cycle(t)} style={{ cursor: "pointer" }}>
                {t.status.replace("_", " ")}
              </span>
              <span>·</span>
              <span>{new Date(t.updated_at).toLocaleTimeString()}</span>
              <span style={{ flex: 1 }} />
              <button
                onClick={async () => {
                  await api.deleteTask(t.id);
                  refresh();
                }}
                style={{ fontSize: 11, padding: "2px 6px" }}
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="section-title">Tip</div>
      <div className="muted" style={{ fontSize: 12 }}>
        Click a status pill to cycle through pending → in progress → completed → failed. The autonomous
        agent (toolbar button <code>Agent</code>) will also create and update tasks here as it runs.
      </div>
    </aside>
  );
}
