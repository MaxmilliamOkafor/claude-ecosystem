import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ask } from "../lib/api.js";
import { collectPageContext } from "../lib/page-reader.js";
import { getSettings } from "../lib/storage.js";
import type { Backend } from "../shared/models.js";

function Popup() {
  const [backend, setBackend] = useState<Backend>("ollama");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => setBackend(s.backend));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const page = await collectPageContext();
      const r = await ask(prompt, page);
      setReply(r.reply);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      // @ts-ignore
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="brand">
          Claude<span className="dot">·</span>Popup
        </div>
        <span className={`badge ${backend}`}>{backend}</span>
      </div>
      <form onSubmit={onSubmit} className="grid">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Quick question about this page…"
        />
        <div className="row">
          <button type="submit" className="primary" disabled={busy || !prompt.trim()}>
            {busy ? "…" : "Ask"}
          </button>
          <button type="button" onClick={openSidePanel}>
            Side panel
          </button>
          <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
            Settings
          </button>
        </div>
      </form>
      {error && <div className="reply" style={{ color: "#ffb4b4", marginTop: 10 }}>⚠ {error}</div>}
      {reply && (
        <>
          <hr />
          <div className="reply">{reply}</div>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
