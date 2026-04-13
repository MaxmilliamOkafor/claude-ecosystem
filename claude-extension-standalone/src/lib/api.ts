import { EXTENSION_SYSTEM } from "../shared/prompts.js";
import { appendHistory, getSettings, type ExtSettings } from "./storage.js";

export interface PageContext {
  url?: string;
  title?: string;
  selection?: string;
  text_snapshot?: string;
}

export interface AskResult {
  reply: string;
  model: string;
  backend: string;
}

function buildSystem(s: ExtSettings, page: PageContext): string {
  let sys = EXTENSION_SYSTEM;
  if (s.systemAddendum.trim()) sys += `\n\n${s.systemAddendum.trim()}`;
  if (page.url) {
    sys += `\n\n<page_context>\nURL: ${page.url}\nTitle: ${page.title ?? ""}\nSelection: ${page.selection ?? ""}\n---\n${(page.text_snapshot ?? "").slice(0, 8000)}\n</page_context>`;
  }
  return sys;
}

/** Dispatch to the configured backend. */
export async function ask(prompt: string, page: PageContext = {}): Promise<AskResult> {
  const s = await getSettings();

  if (page.url) {
    try {
      const host = new URL(page.url).host;
      if (s.disabledHosts.some((h) => host.includes(h))) {
        throw new Error(`Disabled on this host (${host}). Edit options to re-enable.`);
      }
    } catch {
      /* ignore URL parse errors */
    }
  }

  let result: AskResult;
  switch (s.backend) {
    case "ollama":
      result = await askOllama(prompt, page, s);
      break;
    case "claudeai":
      result = await askClaudeAi(prompt, page);
      break;
    case "anthropic":
      result = await askAnthropic(prompt, page, s);
      break;
    default:
      throw new Error(`Unknown backend: ${s.backend}`);
  }

  await appendHistory({
    id: crypto.randomUUID(),
    at: Date.now(),
    url: page.url,
    title: page.title,
    prompt,
    reply: result.reply,
    model: result.model,
    backend: s.backend,
  });

  return result;
}

/* -------------------- OLLAMA (default, no key, no limits) -------------------- */

/**
 * Talks to a local Ollama server (https://ollama.com). Ollama exposes an
 * HTTP API on 127.0.0.1:11434 by default. Models run on the user's own
 * hardware, so there is no key and no remote quota. This is the only mode
 * that is truly "unlimited" in the sense of the user's request.
 *
 * Install Ollama once: https://ollama.com/download
 * Then pull a model:   ollama pull llama3.2
 */
async function askOllama(prompt: string, page: PageContext, s: ExtSettings): Promise<AskResult> {
  const url = s.ollamaUrl.replace(/\/$/, "") + "/api/chat";
  const system = buildSystem(s, page);
  const body = {
    model: s.model,
    stream: false,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Can't reach Ollama at ${s.ollamaUrl}. Is it running? Install from https://ollama.com/download and run \`ollama serve\`. (${(err as Error).message})`
    );
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404 && /model/i.test(text)) {
      throw new Error(
        `Model "${s.model}" isn't pulled yet. Run: ollama pull ${s.model.split(":")[0]}`
      );
    }
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  const j = (await res.json()) as { message?: { content?: string }; model?: string };
  return { reply: j.message?.content ?? "", model: j.model ?? s.model, backend: "ollama" };
}

/* -------------------- CLAUDE.AI TAB (no key, uses user's plan) -------------------- */

/**
 * Opens Claude.ai in a new tab with the prompt pre-filled via the URL's
 * `?q=` parameter (Claude.ai's "new chat with question" entry point). The
 * conversation happens in the Claude.ai web app, bound to whatever plan
 * the user is logged into. Nothing is charged to an API key.
 *
 * This "mode" does not return a reply inside the side panel; it hands off
 * to claude.ai. The returned AskResult just acknowledges the hand-off.
 */
async function askClaudeAi(prompt: string, page: PageContext): Promise<AskResult> {
  const parts: string[] = [prompt];
  if (page.url) parts.push(`\n\nContext: I'm reading ${page.title ?? ""} at ${page.url}.`);
  if (page.selection) parts.push(`\n\nSelected text:\n"""${page.selection.slice(0, 4000)}"""`);

  const q = encodeURIComponent(parts.join(""));
  const url = `https://claude.ai/new?q=${q}`;

  await chrome.tabs.create({ url });
  return {
    reply: `Opened Claude.ai in a new tab with your prompt. Continue the conversation there.`,
    model: "claudeai",
    backend: "claudeai",
  };
}

/* -------------------- ANTHROPIC API (BYO key) -------------------- */

async function askAnthropic(prompt: string, page: PageContext, s: ExtSettings): Promise<AskResult> {
  if (!s.anthropicApiKey) {
    throw new Error(
      "Anthropic mode requires an API key. Paste one in the options page, or switch to Ollama (local, no key)."
    );
  }
  const system = buildSystem(s, page);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": s.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: s.model,
      max_tokens: s.anthropicMaxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    model: string;
  };
  const reply = j.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  return { reply, model: j.model, backend: "anthropic" };
}
