import { DEFAULT_MODEL_ID } from "@claude-eco/shared";

export interface ExtSettings {
  /**
   * Where to send extension API calls. Defaults to the local Cowork server.
   * Users can switch this to a remote deployment or their own proxy.
   */
  apiBase: string;
  /** Direct Anthropic API key. If set, the extension calls Anthropic directly. */
  anthropicApiKey: string;
  /** Active model id. */
  model: string;
  /** Extension persona system-prompt customization. */
  systemAddendum: string;
  /** Max tokens per reply from the extension. */
  maxTokens: number;
  /** Per-site enabled switch. Empty = enabled everywhere. */
  disabledHosts: string[];
}

export const DEFAULTS: ExtSettings = {
  apiBase: "http://127.0.0.1:5174",
  anthropicApiKey: "",
  model: DEFAULT_MODEL_ID,
  systemAddendum: "",
  maxTokens: 1024,
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

/* History — local session-ish log of recent exchanges for the options page. */

export interface HistoryEntry {
  id: string;
  at: number;
  url?: string;
  title?: string;
  prompt: string;
  reply: string;
  model: string;
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
