import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ANTHROPIC_MODELS,
  CLAUDEAI_MODELS,
  OLLAMA_PRESETS,
  type Backend,
} from "../shared/models.js";
import {
  DEFAULTS,
  clearHistory,
  getHistory,
  getSettings,
  setSettings,
  type ExtSettings,
  type HistoryEntry,
} from "../lib/storage.js";

function Options() {
  const [s, setS] = useState<ExtSettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [hist, setHist] = useState<HistoryEntry[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<string>("…");
  const [newModel, setNewModel] = useState("");

  useEffect(() => {
    getSettings().then(setS);
    getHistory().then(setHist);
  }, []);

  useEffect(() => {
    if (s.backend !== "ollama") return;
    (async () => {
      try {
        const r = await fetch(s.ollamaUrl.replace(/\/$/, "") + "/api/tags", { method: "GET" });
        if (r.ok) {
          const j = (await r.json()) as { models?: Array<{ name: string }> };
          setOllamaStatus(`✅ Ollama reachable (${j.models?.length ?? 0} model(s) installed)`);
        } else {
          setOllamaStatus(`⚠ Ollama responded with ${r.status}`);
        }
      } catch (err) {
        setOllamaStatus(
          `❌ Can't reach Ollama at ${s.ollamaUrl} — install from ollama.com and run \`ollama serve\`.`
        );
      }
    })();
  }, [s.backend, s.ollamaUrl]);

  async function save() {
    await setSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const modelsForBackend =
    s.backend === "ollama"
      ? [...OLLAMA_PRESETS, ...s.ollamaExtraModels.map((id) => ({ id, label: id }))]
      : s.backend === "claudeai"
        ? CLAUDEAI_MODELS
        : ANTHROPIC_MODELS;

  return (
    <div className="grid">
      <div className="brand" style={{ fontSize: 22 }}>
        Claude<span className="dot">·</span>Settings
      </div>

      <div>
        <div className="label">Backend</div>
        <select value={s.backend} onChange={(e) => setS({ ...s, backend: e.target.value as Backend })}>
          <option value="ollama">Local model via Ollama — no key, no limits (recommended)</option>
          <option value="claudeai">Claude.ai tab — no key, uses your Claude.ai plan</option>
          <option value="anthropic">Anthropic API — pay per token, needs API key</option>
        </select>
        <div className="small muted" style={{ marginTop: 6 }}>
          {s.backend === "ollama" && (
            <>
              Ollama runs an LLM on your own machine. Download it from{" "}
              <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a>, then
              in a terminal run <code>ollama pull llama3.2</code> (or any other model). {ollamaStatus}
            </>
          )}
          {s.backend === "claudeai" && (
            <>Opens Claude.ai in a new tab with your prompt pre-filled. Your existing Claude.ai login + plan apply. No API key needed.</>
          )}
          {s.backend === "anthropic" && (
            <>Calls the Anthropic API directly from your browser. Paste your key below; usage is billed to that key's account.</>
          )}
        </div>
      </div>

      <div>
        <div className="label">Model</div>
        <select value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })}>
          {modelsForBackend.map((m: any) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {s.backend === "ollama" && (
        <>
          <div>
            <div className="label">Ollama server URL</div>
            <input
              value={s.ollamaUrl}
              onChange={(e) => setS({ ...s, ollamaUrl: e.target.value })}
              placeholder="http://127.0.0.1:11434"
            />
          </div>
          <div>
            <div className="label">Add a custom Ollama model</div>
            <div className="row">
              <input
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                placeholder="e.g. mixtral:8x7b"
              />
              <button
                onClick={() => {
                  const id = newModel.trim();
                  if (!id) return;
                  setS({ ...s, ollamaExtraModels: [...new Set([...s.ollamaExtraModels, id])] });
                  setNewModel("");
                }}
              >
                Add
              </button>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              Whatever you've pulled with <code>ollama pull &lt;name&gt;</code>.
            </div>
          </div>
        </>
      )}

      {s.backend === "anthropic" && (
        <>
          <div>
            <div className="label">Anthropic API key</div>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={s.anthropicApiKey}
              onChange={(e) => setS({ ...s, anthropicApiKey: e.target.value })}
            />
          </div>
          <div>
            <div className="label">Max tokens per reply</div>
            <input
              type="number"
              value={s.anthropicMaxTokens}
              onChange={(e) => setS({ ...s, anthropicMaxTokens: Number(e.target.value) || 1024 })}
            />
          </div>
        </>
      )}

      <div>
        <div className="label">System prompt addendum</div>
        <textarea
          value={s.systemAddendum}
          onChange={(e) => setS({ ...s, systemAddendum: e.target.value })}
          placeholder="Optional extra instructions appended to the system prompt on every call."
        />
      </div>

      <div>
        <div className="label">Disabled hosts (comma-separated, e.g. bank.com, intranet.corp)</div>
        <input
          value={s.disabledHosts.join(", ")}
          onChange={(e) =>
            setS({
              ...s,
              disabledHosts: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
      </div>

      <div className="row">
        <button className="primary" onClick={save}>
          {saved ? "Saved ✓" : "Save"}
        </button>
        <button onClick={() => setS(DEFAULTS)}>Reset to defaults</button>
      </div>

      <hr />

      <div className="brand" style={{ fontSize: 18 }}>History</div>
      <div className="row">
        <button
          onClick={async () => {
            await clearHistory();
            setHist([]);
          }}
        >
          Clear history
        </button>
        <div className="muted small">{hist.length} entries (up to 200 kept locally).</div>
      </div>
      <div className="grid">
        {hist.slice(0, 40).map((h) => (
          <div key={h.id} className="reply">
            <div className="small muted">
              {new Date(h.at).toLocaleString()} · <span className={`badge ${h.backend}`}>{h.backend}</span> ·{" "}
              {h.model} · {h.title ?? h.url ?? ""}
            </div>
            <div style={{ marginTop: 4 }}>
              <b>Q:</b> {h.prompt.slice(0, 400)}
            </div>
            <div style={{ marginTop: 4 }}>
              <b>A:</b> {h.reply.slice(0, 600)}
              {h.reply.length > 600 ? "…" : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const mountNode = document.getElementById("root");
if (!mountNode) {
  document.body.innerHTML = '<div style="padding:12px;color:#e6e9f2;background:#0f1115;font-family:sans-serif">Claude options failed to find #root</div>';
} else {
  try {
    createRoot(mountNode).render(<Options />);
  } catch (err) {
    mountNode.innerHTML = `<div style="padding:12px;color:#ffb4b4;font-family:sans-serif">Claude options crashed: ${(err as Error).message}</div>`;
  }
}
