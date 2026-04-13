import { Router } from "express";
import {
  CLAUDE_COWORK_SYSTEM,
  DEFAULT_MODEL_ID,
  resolveModel,
  getClient,
  withRetry,
  type ToolDefinition,
} from "@claude-eco/shared";
import { db } from "../db.js";
import { getSession, persistMessages } from "./sessions.js";
import crypto from "node:crypto";

/**
 * Autonomous agent endpoint. Runs a plan → execute loop with a small set of
 * safe server-side tools (task management + browse). File I/O and shell are
 * intentionally NOT exposed to the web; those live in Claude Code CLI where
 * the user controls the sandbox.
 */

export const agentRouter = Router();

const TOOLS: ToolDefinition[] = [
  {
    name: "add_task",
    description: "Add a task to the session's task list.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update a task's status or notes.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "in_progress", "completed", "failed"] },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_tasks",
    description: "List all tasks for the current session.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "browse_fetch",
    description: "Fetch a URL and return a text extract.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "browse_search",
    description: "Search the web and return top results.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "finish",
    description: "Signal the agent loop that the user's goal is done.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
  },
];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function runTool(
  sessionId: string,
  name: string,
  input: Record<string, any>
): Promise<string> {
  const now = new Date().toISOString();
  switch (name) {
    case "add_task": {
      const id = crypto.randomUUID();
      db.prepare(
        "INSERT INTO tasks(id,session_id,title,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)"
      ).run(id, sessionId, String(input.title), "pending", input.notes ?? null, now, now);
      return `added task ${id}`;
    }
    case "update_task": {
      db.prepare(
        "UPDATE tasks SET status=COALESCE(?, status), notes=COALESCE(?, notes), updated_at=? WHERE id=?"
      ).run(input.status ?? null, input.notes ?? null, now, input.id);
      return `updated ${input.id}`;
    }
    case "list_tasks": {
      const rows = db
        .prepare("SELECT id, title, status FROM tasks WHERE session_id=? ORDER BY created_at ASC")
        .all(sessionId) as Array<{ id: string; title: string; status: string }>;
      return rows.map((r) => `${r.status.padEnd(12)}  ${r.id.slice(0, 8)}  ${r.title}`).join("\n") || "(no tasks)";
    }
    case "browse_fetch": {
      const r = await fetch(String(input.url), { redirect: "follow" });
      const text = await r.text();
      const ct = r.headers.get("content-type") ?? "";
      const extracted = ct.includes("text/html") ? stripHtml(text) : text;
      return extracted.slice(0, 20_000);
    }
    case "browse_search": {
      const r = await fetch(
        `https://duckduckgo.com/html/?q=${encodeURIComponent(String(input.query))}`,
        { headers: { "user-agent": "Mozilla/5.0 claude-cowork" } }
      );
      const html = await r.text();
      const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const out: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && out.length < 10) {
        const url = decodeURIComponent(m[1].replace(/^\/l\/\?.*?uddg=/, "").split("&")[0]);
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (title && url.startsWith("http")) out.push(`${title}\n  ${url}`);
      }
      return out.join("\n\n") || "(no results)";
    }
    case "finish":
      return `finished: ${input.summary ?? ""}`;
    default:
      return `unknown tool: ${name}`;
  }
}

agentRouter.post("/run", async (req, res) => {
  const sessionId = String(req.body?.session_id ?? "");
  const goal = String(req.body?.goal ?? "").trim();
  if (!sessionId || !goal) return res.status(400).json({ error: "session_id and goal required" });

  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "session_not_found" });

  const model = resolveModel(req.body?.model ?? session.model ?? DEFAULT_MODEL_ID).id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const write = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const messages: any[] = [...(session.messages as any[]), { role: "user", content: goal }];
  const maxSteps = 12;
  const client = getClient();

  try {
    for (let step = 0; step < maxSteps; step++) {
      write("step", { step: step + 1 });
      const response = await withRetry(() =>
        client.messages.create({
          model,
          max_tokens: 4096,
          system: CLAUDE_COWORK_SYSTEM,
          messages: messages as any,
          tools: TOOLS as any,
        })
      );

      messages.push({ role: "assistant", content: response.content as any });

      for (const block of response.content as any[]) {
        if (block.type === "text" && block.text?.trim()) {
          write("thought", { text: block.text });
        }
      }

      const toolUses = (response.content as any[]).filter((b) => b.type === "tool_use");
      if (!toolUses.length || response.stop_reason !== "tool_use") break;

      const results: any[] = [];
      let finished = false;
      for (const tu of toolUses) {
        write("tool_call", { name: tu.name, input: tu.input });
        const out = await runTool(sessionId, tu.name, tu.input);
        write("tool_result", { name: tu.name, content: out.slice(0, 4000) });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: out,
        });
        if (tu.name === "finish") finished = true;
      }
      messages.push({ role: "user", content: results });
      persistMessages(sessionId, messages);
      if (finished) break;
    }

    persistMessages(sessionId, messages);
    write("done", { ok: true });
    res.end();
  } catch (err) {
    write("error", { message: (err as Error).message });
    res.end();
  }
});
