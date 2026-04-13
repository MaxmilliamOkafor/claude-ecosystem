import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { listModels } from "@claude-eco/shared";
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

  useEffect(() => {
    getSettings().then(setS);
    getHistory().then(setHist);
  }, []);

  async function save() {
    await setSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="grid">
      <div className="brand" style={{ fontSize: 20 }}>
        Claude<span className="dot">·</span>Settings
      </div>

      <div>
        <div className="label">API base (Claude Cowork server)</div>
        <input value={s.apiBase} onChange={(e) => setS({ ...s, apiBase: e.target.value })} />
        <div className="small muted">
          The extension will prefer this backend. If unreachable, it falls back to the Anthropic API key below.
        </div>
      </div>

      <div>
        <div className="label">Anthropic API key (optional fallback)</div>
        <input
          type="password"
          placeholder="sk-ant-..."
          value={s.anthropicApiKey}
          onChange={(e) => setS({ ...s, anthropicApiKey: e.target.value })}
        />
      </div>

      <div className="row">
        <div style={{ flex: 1 }}>
          <div className="label">Default model</div>
          <select value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })}>
            {listModels().map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.family})
              </option>
            ))}
          </select>
        </div>
        <div style={{ width: 160 }}>
          <div className="label">Max tokens</div>
          <input
            type="number"
            value={s.maxTokens}
            onChange={(e) => setS({ ...s, maxTokens: Number(e.target.value) || 1024 })}
          />
        </div>
      </div>

      <div>
        <div className="label">System prompt addendum</div>
        <textarea
          value={s.systemAddendum}
          onChange={(e) => setS({ ...s, systemAddendum: e.target.value })}
          placeholder="Optional extra instructions appended to the system prompt."
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

      <div className="brand" style={{ fontSize: 16 }}>
        History
      </div>
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
              {new Date(h.at).toLocaleString()} · {h.model} · {h.title ?? h.url ?? ""}
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

createRoot(document.getElementById("root")!).render(<Options />);
