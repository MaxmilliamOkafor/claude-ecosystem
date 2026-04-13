import { CLAUDE_EXTENSION_SYSTEM } from "@claude-eco/shared";
import { getSettings, appendHistory, type ExtSettings } from "./storage.js";

export interface PageContext {
  url?: string;
  title?: string;
  selection?: string;
  text_snapshot?: string;
}

export interface AskResult {
  reply: string;
  model: string;
}

/**
 * Ask Claude. Tries the configured Cowork backend first; if that's unreachable
 * and an Anthropic API key is configured, falls back to a direct call.
 */
export async function ask(prompt: string, page: PageContext = {}): Promise<AskResult> {
  const s = await getSettings();
  try {
    const r = await fetch(`${s.apiBase.replace(/\/$/, "")}/api/chat/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        model: s.model,
        persona: "extension",
        page_context: page,
      }),
    });
    if (!r.ok) throw new Error(`server ${r.status}`);
    const j = (await r.json()) as { reply: string; model: string };
    await appendHistory({
      id: crypto.randomUUID(),
      at: Date.now(),
      url: page.url,
      title: page.title,
      prompt,
      reply: j.reply,
      model: j.model,
    });
    return j;
  } catch (err) {
    if (!s.anthropicApiKey) {
      throw new Error(
        `Could not reach Claude Cowork at ${s.apiBase}. Either start the local server or set an Anthropic API key in the options page. (${(err as Error).message})`
      );
    }
    return askAnthropicDirect(prompt, page, s);
  }
}

async function askAnthropicDirect(prompt: string, page: PageContext, s: ExtSettings): Promise<AskResult> {
  let system = CLAUDE_EXTENSION_SYSTEM;
  if (s.systemAddendum.trim()) system += `\n\n${s.systemAddendum.trim()}`;
  if (page.url) {
    system += `\n\n<page_context>\nURL: ${page.url}\nTitle: ${page.title ?? ""}\nSelection: ${page.selection ?? ""}\n---\n${(page.text_snapshot ?? "").slice(0, 8000)}\n</page_context>`;
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": s.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: s.model,
      max_tokens: s.maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { content: Array<{ type: string; text?: string }>; model: string };
  const reply = j.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  await appendHistory({
    id: crypto.randomUUID(),
    at: Date.now(),
    url: page.url,
    title: page.title,
    prompt,
    reply,
    model: j.model,
  });
  return { reply, model: j.model };
}
