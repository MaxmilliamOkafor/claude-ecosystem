export interface SessionSummary {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface SessionFull extends SessionSummary {
  messages: Array<{ role: "user" | "assistant"; content: any }>;
}

export interface TaskRow {
  id: string;
  session_id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
  family: string;
  tier: number;
  vision: boolean;
  tools: boolean;
  contextTokens: number;
}

const BASE = "/api";

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json() as Promise<T>;
}

export const api = {
  health: () => fetch(`${BASE}/health`).then(j<{ ok: boolean }>),
  models: () => fetch(`${BASE}/models`).then(j<ModelInfo[]>),

  listSessions: () => fetch(`${BASE}/sessions`).then(j<SessionSummary[]>),
  createSession: (title: string, model: string) =>
    fetch(`${BASE}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, model }),
    }).then(j<SessionSummary>),
  getSession: (id: string) => fetch(`${BASE}/sessions/${id}`).then(j<SessionFull>),
  updateSession: (id: string, patch: { title?: string; model?: string }) =>
    fetch(`${BASE}/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<{ ok: true }>),
  deleteSession: (id: string) =>
    fetch(`${BASE}/sessions/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),

  listTasks: (sessionId: string) =>
    fetch(`${BASE}/tasks?session_id=${encodeURIComponent(sessionId)}`).then(j<TaskRow[]>),
  createTask: (sessionId: string, title: string) =>
    fetch(`${BASE}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, title }),
    }).then(j<TaskRow>),
  updateTask: (id: string, patch: Partial<TaskRow>) =>
    fetch(`${BASE}/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<{ ok: true }>),
  deleteTask: (id: string) =>
    fetch(`${BASE}/tasks/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),
};

/**
 * Consume a Server-Sent Events stream from fetch() and invoke a callback per
 * event. Handles partial chunks.
 */
export async function streamSSE(
  url: string,
  init: RequestInit,
  on: (event: string, data: any) => void
): Promise<void> {
  const res = await fetch(url, init);
  if (!res.body) throw new Error("no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let ev = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      try {
        on(ev, data ? JSON.parse(data) : null);
      } catch {
        on(ev, data);
      }
    }
  }
}
