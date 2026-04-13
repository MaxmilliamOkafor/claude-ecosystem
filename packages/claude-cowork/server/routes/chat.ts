import { Router } from "express";
import crypto from "node:crypto";
import {
  CLAUDE_COWORK_SYSTEM,
  CLAUDE_EXTENSION_SYSTEM,
  DEFAULT_MODEL_ID,
  resolveModel,
  getClient,
  withRetry,
} from "@claude-eco/shared";
import { db } from "../db.js";
import { getSession, persistMessages } from "./sessions.js";

export const chatRouter = Router();

interface ChatBody {
  session_id: string;
  message: string;
  model?: string;
  /** "cowork" (default) or "extension" — picks a system prompt. */
  persona?: "cowork" | "extension";
  /** Optional page context for the extension persona. */
  page_context?: {
    url?: string;
    title?: string;
    selection?: string;
    text_snapshot?: string;
  };
}

/**
 * Streaming chat endpoint (Server-Sent Events). The client reads this as an
 * EventSource / fetch stream and renders tokens as they arrive.
 */
chatRouter.post("/", async (req, res) => {
  const body = req.body as ChatBody;
  if (!body?.message || !body?.session_id) {
    return res.status(400).json({ error: "message and session_id required" });
  }

  const session = getSession(body.session_id);
  if (!session) return res.status(404).json({ error: "session_not_found" });

  const model = resolveModel(body.model ?? session.model ?? DEFAULT_MODEL_ID).id;
  const persona = body.persona ?? "cowork";
  let system = persona === "extension" ? CLAUDE_EXTENSION_SYSTEM : CLAUDE_COWORK_SYSTEM;
  if (body.page_context) {
    const pc = body.page_context;
    system += `\n\n<page_context>\nURL: ${pc.url ?? ""}\nTitle: ${pc.title ?? ""}\nSelection: ${pc.selection ?? ""}\n---\n${(pc.text_snapshot ?? "").slice(0, 8_000)}\n</page_context>`;
  }

  const messages = [...(session.messages as any[])];
  messages.push({ role: "user", content: body.message });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const write = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const client = getClient();
    let finalText = "";
    await withRetry(async () => {
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system,
        messages: messages as any,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          finalText += event.delta.text;
          write("token", { text: event.delta.text });
        } else if (event.type === "message_stop") {
          // handled after loop
        }
      }
      await stream.finalMessage();
    });

    messages.push({ role: "assistant", content: finalText });
    persistMessages(body.session_id, messages);

    db.prepare(
      "INSERT INTO logs(session_id, kind, text, created_at) VALUES(?,?,?,?)"
    ).run(body.session_id, "assistant", finalText.slice(0, 4000), new Date().toISOString());

    write("done", { text: finalText });
    res.end();
  } catch (err) {
    write("error", { message: (err as Error).message });
    res.end();
  }
});

/**
 * One-shot (non-streaming) endpoint. Used by the extension popup where SSE is
 * overkill and by headless callers.
 */
chatRouter.post("/complete", async (req, res) => {
  const body = req.body as ChatBody;
  if (!body?.message) return res.status(400).json({ error: "message required" });

  // Extension-persona requests can be ephemeral (no session row).
  let messages: any[] = [];
  let sessionId = body.session_id;
  if (sessionId) {
    const s = getSession(sessionId);
    if (!s) return res.status(404).json({ error: "session_not_found" });
    messages = s.messages as any[];
  }
  messages.push({ role: "user", content: body.message });

  const model = resolveModel(body.model ?? DEFAULT_MODEL_ID).id;
  const persona = body.persona ?? "cowork";
  let system = persona === "extension" ? CLAUDE_EXTENSION_SYSTEM : CLAUDE_COWORK_SYSTEM;
  if (body.page_context) {
    const pc = body.page_context;
    system += `\n\n<page_context>\nURL: ${pc.url ?? ""}\nTitle: ${pc.title ?? ""}\nSelection: ${pc.selection ?? ""}\n---\n${(pc.text_snapshot ?? "").slice(0, 8_000)}\n</page_context>`;
  }

  try {
    const client = getClient();
    const result = await withRetry(() =>
      client.messages.create({
        model,
        max_tokens: 2048,
        system,
        messages: messages as any,
      })
    );
    const reply = result.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    if (sessionId) {
      messages.push({ role: "assistant", content: reply });
      persistMessages(sessionId, messages);
    }
    res.json({ id: crypto.randomUUID(), reply, model });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
