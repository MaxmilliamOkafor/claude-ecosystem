import React, { useEffect, useRef, useState } from "react";
import { api, streamSSE, type ModelInfo, type SessionFull } from "../api.js";
import { ModelSelector } from "./ModelSelector.js";

type UiMessage =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "tool"; text: string }
  | { kind: "error"; text: string };

function toUi(messages: SessionFull["messages"]): UiMessage[] {
  const out: UiMessage[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ kind: m.role === "user" ? "user" : "assistant", text: m.content });
      continue;
    }
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content as any[]) {
      if (b.type === "text") {
        out.push({ kind: m.role === "user" ? "user" : "assistant", text: b.text });
      } else if (b.type === "tool_use") {
        out.push({ kind: "tool", text: `→ ${b.name}(${JSON.stringify(b.input)})` });
      } else if (b.type === "tool_result") {
        const txt = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        out.push({ kind: "tool", text: `← ${txt}`.slice(0, 2000) });
      }
    }
  }
  return out;
}

export function Chat({
  session,
  models,
  onModelChange,
  onAfterSend,
}: {
  session: SessionFull;
  models: ModelInfo[];
  onModelChange: (id: string) => void;
  onAfterSend: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"chat" | "agent">("chat");
  const [ui, setUi] = useState<UiMessage[]>(() => toUi(session.messages));
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => setUi(toUi(session.messages)), [session.id]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [ui.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);

    setUi((prev) => [...prev, { kind: "user", text }, { kind: "assistant", text: "", streaming: true }]);

    try {
      if (mode === "chat") {
        await streamSSE(
          "/api/chat",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session_id: session.id, message: text, model: session.model }),
          },
          (ev, data) => {
            if (ev === "token") {
              setUi((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.kind === "assistant") last.text += data.text;
                return next;
              });
            } else if (ev === "done") {
              setUi((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.kind === "assistant") last.streaming = false;
                return next;
              });
            } else if (ev === "error") {
              setUi((prev) => [...prev, { kind: "error", text: data.message ?? String(data) }]);
            }
          }
        );
      } else {
        await streamSSE(
          "/api/agent/run",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session_id: session.id, goal: text, model: session.model }),
          },
          (ev, data) => {
            if (ev === "thought") {
              setUi((prev) => [...prev, { kind: "assistant", text: data.text }]);
            } else if (ev === "tool_call") {
              setUi((prev) => [...prev, { kind: "tool", text: `→ ${data.name}(${JSON.stringify(data.input)})` }]);
            } else if (ev === "tool_result") {
              setUi((prev) => [...prev, { kind: "tool", text: `← ${data.content}` }]);
            } else if (ev === "error") {
              setUi((prev) => [...prev, { kind: "error", text: data.message ?? String(data) }]);
            }
          }
        );
      }
    } catch (err) {
      setUi((prev) => [...prev, { kind: "error", text: (err as Error).message }]);
    }

    setBusy(false);
    onAfterSend();
  }

  return (
    <section className="workspace">
      <div className="topbar">
        <div className="title">{session.title || "Untitled"}</div>
        <div className="spacer" />
        <ModelSelector
          models={models}
          value={session.model}
          onChange={(id) => {
            onModelChange(id);
            api.updateSession(session.id, { model: id });
          }}
        />
        <button
          className={mode === "agent" ? "primary" : ""}
          onClick={() => setMode(mode === "agent" ? "chat" : "agent")}
          title="Toggle autonomous agent mode"
        >
          {mode === "agent" ? "Agent ON" : "Agent"}
        </button>
      </div>

      <div className="chat">
        {ui.length === 0 && (
          <div className="muted">
            Start a conversation. Switch to <b>Agent</b> mode for autonomous multi-step execution with
            browse + task tools.
          </div>
        )}
        {ui.map((m, i) => (
          <div key={i} className={`msg ${m.kind}`}>
            {m.text || (m.kind === "assistant" && (m as any).streaming ? "…" : "")}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="row muted" style={{ fontSize: 12 }}>
          Mode: <b>{mode === "agent" ? "Autonomous agent" : "Chat"}</b> · Model: <b>{session.model}</b>
        </div>
        <form onSubmit={send}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e as any);
            }}
            placeholder={
              mode === "agent"
                ? "Describe a goal for the autonomous agent (e.g. 'research X and add tasks to implement it')"
                : "Message Claude…  (⌘/Ctrl+Enter to send)"
            }
          />
          <button type="submit" className="primary" disabled={busy || !draft.trim()}>
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}
