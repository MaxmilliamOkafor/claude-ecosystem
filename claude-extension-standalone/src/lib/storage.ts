import { DEFAULT_MODEL_ID, type Backend } from "../shared/models.js";

export interface ExtSettings {
  /** Which backend is active for normal "Ask" calls. */
  backend: Backend;
  /** Active model id (format depends on backend). */
  model: string;

  /** Ollama config (default: truly free / unlimited on your own hardware). */
  ollamaUrl: string;
  ollamaExtraModels: string[];

  /** Anthropic API config (optional — only used if backend = "anthropic"). */
  anthropicApiKey: string;
  anthropicMaxTokens: number;

  /** System-prompt addendum user can customize. */
  systemAddendum: string;

  /** Per-site disable list. */
  disabledHosts: string[];
}

export const DEFAULTS: ExtSettings = {
  backend: "ollama",
  model: DEFAULT_MODEL_ID,
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaExtraModels: [],
  anthropicApiKey: "",
  anthropicMaxTokens: 1024,
  systemAddendum: "",
  disabledHosts: [],
};

const KEY = "claude-ext-settings";

export async function getSettings(): Promise<ExtSettings> {
  const out = await chrome.storage.sync.get(KEY);
  return { ...DEFAULTS, ...((out?.[KEY] as Partial<ExtSettings>) ?? {}) };
}

export async function setSettings(s: Partial<ExtSettings>): Promise<ExtSettings> {
  const cur = await getSettings();
  const next = { ...cur, ...s };
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

/* ---------- History (local rolling log, max 200 entries) ---------- */

export interface HistoryEntry {
  id: string;
  at: number;
  url?: string;
  title?: string;
  prompt: string;
  reply: string;
  model: string;
  backend: Backend;
}

const HISTORY_KEY = "claude-ext-history";
const HISTORY_LIMIT = 200;

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const out = await chrome.storage.local.get(HISTORY_KEY);
  const list: HistoryEntry[] = out?.[HISTORY_KEY] ?? [];
  list.unshift(entry);
  while (list.length > HISTORY_LIMIT) list.pop();
  await chrome.storage.local.set({ [HISTORY_KEY]: list });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const out = await chrome.storage.local.get(HISTORY_KEY);
  return (out?.[HISTORY_KEY] as HistoryEntry[]) ?? [];
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}
