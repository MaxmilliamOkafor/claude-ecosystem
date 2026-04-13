import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { listModels } from "@claude-eco/shared";
import { sessionsRouter } from "./routes/sessions.js";
import { tasksRouter } from "./routes/tasks.js";
import { chatRouter } from "./routes/chat.js";
import { agentRouter } from "./routes/agent.js";
import { browseRouter } from "./routes/browse.js";

const PORT = Number(process.env.COWORK_PORT ?? 5174);
const HOST = process.env.COWORK_HOST ?? "127.0.0.1";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, version: "1.0.0" }));
app.get("/api/models", (_req, res) => res.json(listModels()));

app.use("/api/sessions", sessionsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/chat", chatRouter);
app.use("/api/agent", agentRouter);
app.use("/api/browse", browseRouter);

// Serve the built web bundle in production. In dev, Vite serves it directly.
const webDist = path.resolve(process.cwd(), "dist/web");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`claude-cowork server ready on http://${HOST}:${PORT}`);
});
