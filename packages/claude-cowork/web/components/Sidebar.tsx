import React from "react";
import type { SessionSummary } from "../api.js";

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: SessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="sidebar">
      <h1 className="brand">
        Claude<span className="dot">·</span>Cowork
      </h1>
      <button className="primary" onClick={onNew} style={{ width: "100%" }}>
        + New session
      </button>
      <div className="section-title">Sessions</div>
      {sessions.length === 0 && <div className="muted">No sessions yet.</div>}
      {sessions.map((s) => (
        <div
          key={s.id}
          className={`session-item ${s.id === activeId ? "active" : ""}`}
          onClick={() => onSelect(s.id)}
        >
          <div className="t">{s.title || "Untitled"}</div>
          <div className="s">
            {new Date(s.updated_at).toLocaleString()} · {s.model}
          </div>
          <div style={{ marginTop: 4 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this session?")) onDelete(s.id);
              }}
              style={{ fontSize: 11, padding: "2px 6px" }}
            >
              delete
            </button>
          </div>
        </div>
      ))}
    </aside>
  );
}
