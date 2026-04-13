import React, { useEffect, useState } from "react";
import { ALL_MODELS, OLLAMA_PRESETS, CLAUDEAI_MODELS, ANTHROPIC_MODELS, type Backend } from "../shared/models.js";
import { ask } from "../lib/api.js";
import { collectPageContext } from "../lib/page-reader.js";
import { getSettings, setSettings } from "../lib/storage.js";

const PRESETS = [
  { key: "summarize", label: "Summarize", prompt: "Summarize this page in tight bullet points. Preserve key facts, numbers, and quotes." },
  { key: "explain", label: "Explain", prompt: "Explain the selection (or the page) like I'm a smart non-expert. Short paragraphs, examples." },
  { key: "rewrite", label: "Rewrite", prompt: "Rewrite the selection to be clearer, tighter, more persuasive. Preserve voice." },
  { key: "extract", label: "Extract", prompt: "Extract the structured data (tables, lists, entities) from the page as clean markdown." },
  { key: "translate", label: "Translate", prompt: "Translate the selection to English. If already English, translate to Spanish." },
  { key: "qa", label: "Q&A", prompt: "What are the 5 most useful questions a reader would ask about this page, with concise answers?" },
];

export function SidePanel() {
  const [backend, setBackend] = useState<Backend>("ollama");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraModels, setExtraModels] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setBackend(s.backend);
      setModel(s.model);
      setExtraModels(s.ollamaExtraModels);
      // Auto-run pending context-menu action
      const p = await chrome.storage.session.get("pending-action");
      const pa = p?.["pending-action"] as { action?: string } | undefined;
      if (pa?.action) {
        await chrome.storage.session.remove("pending-action");
        const preset = PRESETS.find(
          (x) =>
            (pa.action ?? "").includes(x.key) ||
            (x.key === "summarize" && (pa.action ?? "").includes("summarize")) ||
            (x.key === "extract" && (pa.action ?? "").includes("extract"))
        );
        if (preset) runPreset(preset.prompt);
      }
    })();
  }, []);

  async function onBackendChange(b: Backend) {
    setBackend(b);
    const defaultModel =
      b === "ollama"
        ? OLLAMA_PRESETS[0].id
        : b === "claudeai"
          ? CLAUDEAI_MODELS[0].id
          : ANTHROPIC_MODELS[0].id;
    setModel(defaultModel);
    await setSettings({ backend: b, model: defaultModel });
  }

  async function onModelChange(m: string) {
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

  const modelsForBackend =
    backend === "ollama"
      ? [...OLLAMA_PRESETS, ...extraModels.map((id) => ({ id, label: id, backend: "ollama" as const, description: "Custom Ollama model" }))]
      : backend === "claudeai"
        ? CLAUDEAI_MODELS
        : ANTHROPIC_MODELS;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="brand">
          Claude<span className="dot">·</span>Sidepanel
        </div>
        <span className={`badge ${backend}`}>{backend}</span>
      </div>

      <div className="grid" style={{ marginBottom: 10 }}>
        <div className="row">
          <select value={backend} onChange={(e) => onBackendChange(e.target.value as Backend)} style={{ flex: 1 }}>
            <option value="ollama">Local (Ollama) — no key, no limits</option>
            <option value="claudeai">Claude.ai tab — uses your plan</option>
            <option value="anthropic">Anthropic API — needs key</option>
          </select>
          <select value={model} onChange={(e) => onModelChange(e.target.value)} style={{ flex: 1 }}>
            {modelsForBackend.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
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
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask about the current page…" />
        </div>
        <div className="row">
          <button type="submit" className="primary" disabled={busy || !prompt.trim()}>
            {busy ? "Thinking…" : "Ask"}
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
          <div className="label">Reply</div>
          <div className="reply">{reply}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => navigator.clipboard.writeText(reply)}>Copy</button>
            <button onClick={replaceInPage}>Replace selection in page</button>
          </div>
        </>
      )}

      <hr />
      <div className="small muted">
        {backend === "ollama" && (
          <>
            Using a local model via Ollama at your machine. No API key, no remote quota. Install Ollama from{" "}
            <code>ollama.com</code> and run <code>ollama pull {model.split(":")[0]}</code> if this is your first time.
          </>
        )}
        {backend === "claudeai" && (
          <>Your prompt opens a new Claude.ai tab. Usage is bound by your Claude.ai plan (Free / Pro / Max).</>
        )}
        {backend === "anthropic" && (
          <>Calls api.anthropic.com directly. Needs a key in the options page. Subject to your account quota.</>
        )}
      </div>
    </div>
  );
}
