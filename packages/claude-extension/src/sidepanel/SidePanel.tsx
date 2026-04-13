import React, { useEffect, useState } from "react";
import { listModels } from "@claude-eco/shared";
import { ask } from "../lib/api.js";
import { collectPageContext } from "../lib/page-reader.js";
import { getSettings, setSettings } from "../lib/storage.js";

const PRESETS = [
  { key: "summarize", label: "Summarize", prompt: "Summarize the page in tight bullet points, preserving key facts, numbers, and quotes." },
  { key: "explain", label: "Explain", prompt: "Explain the selection (or the page) like I'm a smart non-expert. Use short paragraphs and examples." },
  { key: "rewrite", label: "Rewrite", prompt: "Rewrite the selection to be clearer, tighter, and more persuasive. Preserve the original voice." },
  { key: "extract", label: "Extract", prompt: "Extract the structured data (tables, lists, entities) from the page as clean markdown." },
  { key: "translate", label: "Translate", prompt: "Translate the selection to English. If it's already English, translate to Spanish." },
  { key: "questions", label: "Q&A", prompt: "What are the 5 most useful questions a reader would ask about this page, with concise answers?" },
];

export function SidePanel() {
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setModel(s.model);
      const p = await chrome.storage.session.get("pending-action");
      if (p?.["pending-action"]) {
        const pa = p["pending-action"] as { action: string; selection?: string };
        const preset = PRESETS.find(
          (x) =>
            pa.action.includes(x.key) ||
            (x.key === "summarize" && pa.action.includes("summarize")) ||
            (x.key === "rewrite" && pa.action.includes("rewrite")) ||
            (x.key === "explain" && pa.action.includes("explain")) ||
            (x.key === "extract" && pa.action.includes("extract"))
        );
        if (preset) {
          setPrompt(preset.prompt);
          await chrome.storage.session.remove("pending-action");
          runPreset(preset.prompt);
        }
      }
    })();
  }, []);

  async function onChangeModel(m: string) {
    setModel(m);
    await setSettings({ model: m });
  }

  async function runPreset(p: string) {
    setBusy(true);
    setError(null);
    setPrompt(p);
    try {
      const page = await collectPageContext();
      const r = await ask(p, page);
      setReply(r.reply);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

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

  async function replaceInPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: "replace-selection", text: reply });
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="brand">
          Claude<span className="dot">·</span>Sidepanel
        </div>
        <select value={model} onChange={(e) => onChangeModel(e.target.value)}>
          {listModels().map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="label">Quick actions</div>
      <div className="row wrap actions" style={{ marginBottom: 10 }}>
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => runPreset(p.prompt)} disabled={busy}>
            {p.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="grid">
        <div>
          <div className="label">Your prompt</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask Claude about the current page…"
          />
        </div>
        <div className="row">
          <button type="submit" className="primary" disabled={busy || !prompt.trim()}>
            {busy ? "Thinking…" : "Ask Claude"}
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
          <div className="label">Claude</div>
          <div className="reply">{reply}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => navigator.clipboard.writeText(reply)}>Copy</button>
            <button onClick={replaceInPage}>Replace selection in page</button>
          </div>
        </>
      )}
    </div>
  );
}
