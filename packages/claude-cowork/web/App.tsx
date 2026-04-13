import React, { useEffect, useState } from "react";
import { api, type ModelInfo, type SessionFull, type SessionSummary, type TaskRow } from "./api.js";
import { Sidebar } from "./components/Sidebar.js";
import { Chat } from "./components/Chat.js";
import { Tasks } from "./components/Tasks.js";

export function App() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [active, setActive] = useState<SessionFull | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  async function reloadSessions() {
    const list = await api.listSessions();
    setSessions(list);
    if (!active && list.length) await openSession(list[0].id);
  }

  async function openSession(id: string) {
    const full = await api.getSession(id);
    setActive(full);
    setTasks(await api.listTasks(id));
  }

  async function reloadTasks() {
    if (active) setTasks(await api.listTasks(active.id));
  }

  useEffect(() => {
    api.models().then(setModels).catch(() => setModels([]));
    reloadSessions();
    const interval = setInterval(() => {
      if (active) reloadTasks();
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  async function onNew() {
    const s = await api.createSession("New session", models[0]?.id ?? "claude-opus-4-6");
    await reloadSessions();
    await openSession(s.id);
  }
  async function onDelete(id: string) {
    await api.deleteSession(id);
    if (active?.id === id) setActive(null);
    await reloadSessions();
  }

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        activeId={active?.id ?? null}
        onSelect={openSession}
        onNew={onNew}
        onDelete={onDelete}
      />
      {active ? (
        <Chat
          key={active.id}
          session={active}
          models={models}
          onModelChange={(id) => setActive({ ...active, model: id })}
          onAfterSend={async () => {
            await openSession(active.id);
            await reloadSessions();
            await reloadTasks();
          }}
        />
      ) : (
        <section className="workspace">
          <div className="topbar">
            <div className="title">Claude Cowork</div>
          </div>
          <div className="chat muted" style={{ padding: 40 }}>
            <h2>Welcome to Claude Cowork.</h2>
            <p>Create a session from the left sidebar to begin.</p>
            <p>
              Cowork is a chat + workspace + tasks environment. Toggle <b>Agent</b> mode in the top bar to let Claude plan
              and execute multi-step goals autonomously using web browse and task tools.
            </p>
          </div>
          <div />
        </section>
      )}
      {active ? <Tasks sessionId={active.id} tasks={tasks} refresh={reloadTasks} /> : <div className="tasks-panel" />}
    </div>
  );
}
