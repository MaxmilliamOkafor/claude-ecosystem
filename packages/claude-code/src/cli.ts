#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import { listModels } from "@claude-eco/shared";
import { repl } from "./repl.js";
import { runAgentTurn } from "./agent.js";
import { loadConfig, saveConfig } from "./config.js";
import { listSessions, newSession, saveSession } from "./session.js";

const program = new Command();

program
  .name("claude-code")
  .description("Terminal coding assistant (agent-mode) powered by Claude.")
  .version("1.0.0");

program
  .command("chat", { isDefault: true })
  .description("Start an interactive chat REPL.")
  .option("-m, --model <id>", "model id or alias (opus, sonnet, haiku)")
  .option("-r, --resume <id>", "resume a session by id prefix")
  .action(async (opts) => {
    await repl({ model: opts.model, resume: opts.resume });
  });

program
  .command("ask <prompt...>")
  .description("Send a single prompt and print the answer (one-shot).")
  .option("-m, --model <id>", "model id or alias")
  .action(async (prompt: string[], opts) => {
    const cfg = loadConfig({ model: opts.model });
    const session = newSession(cfg, "one-shot");
    const reply = await runAgentTurn(cfg, session, prompt.join(" "));
    saveSession(cfg, session);
    console.log(reply);
  });

program
  .command("models")
  .description("List available Claude models.")
  .action(() => {
    for (const m of listModels()) {
      console.log(`${chalk.bold(m.id.padEnd(32))} ${chalk.gray(m.description)}`);
    }
  });

program
  .command("sessions")
  .description("List saved sessions.")
  .action(() => {
    const cfg = loadConfig();
    for (const s of listSessions(cfg).slice(0, 50)) {
      console.log(`${chalk.yellow(s.id.slice(0, 8))}  ${s.updatedAt}  ${chalk.gray(s.model)}  ${s.title}`);
    }
  });

program
  .command("set <key> <value>")
  .description("Persist a config value (model, maxTokens, temperature, autoApproveWrites, autoApproveShell).")
  .action((key: string, value: string) => {
    const cfg: Record<string, unknown> = {};
    if (["maxTokens"].includes(key)) cfg[key] = Number(value);
    else if (["temperature"].includes(key)) cfg[key] = Number(value);
    else if (key.startsWith("autoApprove")) cfg[key] = value === "true" || value === "on";
    else cfg[key] = value;
    saveConfig(cfg);
    console.log(chalk.green(`→ ${key}=${value}`));
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red("fatal:"), err.message);
  process.exit(1);
});
