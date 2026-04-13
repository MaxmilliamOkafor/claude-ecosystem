import chalk from "chalk";
import prompts from "prompts";
import { listModels, resolveModel } from "@claude-eco/shared";
import { runAgentTurn } from "./agent.js";
import { appendMemory } from "./memory.js";
import { listSessions, loadSession, newSession, saveSession, type Session } from "./session.js";
import { loadConfig, saveConfig, type Config } from "./config.js";

const BANNER = `
${chalk.bold.magenta("Claude Code")} ${chalk.gray("— terminal coding assistant")}
${chalk.gray("Type /help for commands, /quit to exit.")}
`;

function printHelp() {
  console.log(
    [
      chalk.bold("Slash commands"),
      "  /help              show this help",
      "  /model <id|alias>  switch the active Claude model (opus, sonnet, haiku, or full id)",
      "  /models            list available models",
      "  /sessions          list recent sessions",
      "  /resume <id>       resume a session by id",
      "  /new [title]       start a new session",
      "  /memory <note>     append a line to project memory",
      "  /auto writes|shell on|off   toggle auto-approval",
      "  /log               show the current session log",
      "  /clear             clear the screen",
      "  /quit              exit",
      "",
      chalk.gray("Anything else is sent to the agent."),
    ].join("\n")
  );
}

export async function repl(initial?: { resume?: string; model?: string }) {
  const cfg = loadConfig({ model: initial?.model });
  let session: Session = initial?.resume
    ? loadSession(cfg, initial.resume)
    : newSession(cfg, "Terminal session");

  console.log(BANNER);
  console.log(
    chalk.gray(
      `model: ${chalk.white(resolveModel(session.model).label)}   project: ${chalk.white(cfg.projectRoot)}   session: ${session.id.slice(0, 8)}`
    )
  );

  while (true) {
    const res = await prompts({
      type: "text",
      name: "q",
      message: chalk.cyan("›"),
    });
    const q = (res.q ?? "").trim();
    if (!q) continue;
    if (q.startsWith("/")) {
      const stop = await handleSlash(q, cfg, session, (s) => (session = s));
      if (stop) break;
      continue;
    }

    try {
      const reply = await runAgentTurn(cfg, session, q, {
        onStep: (label) => process.stdout.write(chalk.gray(`  · ${label}\n`)),
      });
      if (reply) console.log("\n" + chalk.white(reply) + "\n");
    } catch (err) {
      console.error(chalk.red("error:"), (err as Error).message);
    }
    saveSession(cfg, session);
  }
}

async function handleSlash(
  line: string,
  cfg: Config,
  session: Session,
  setSession: (s: Session) => void
): Promise<boolean> {
  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "help":
      printHelp();
      return false;
    case "quit":
    case "exit":
      return true;
    case "clear":
      console.clear();
      return false;
    case "model": {
      if (!arg) {
        console.log(chalk.gray(`current: ${resolveModel(session.model).label}`));
        return false;
      }
      const m = resolveModel(arg);
      session.model = m.id;
      cfg.model = m.id;
      saveConfig({ model: m.id });
      saveSession(cfg, session);
      console.log(chalk.green(`→ switched to ${m.label}`));
      return false;
    }
    case "models": {
      for (const m of listModels()) {
        console.log(`  ${chalk.bold(m.id)}  ${chalk.gray(m.description)}`);
      }
      return false;
    }
    case "sessions": {
      const list = listSessions(cfg).slice(0, 20);
      for (const s of list) {
        console.log(`  ${chalk.yellow(s.id.slice(0, 8))}  ${s.updatedAt}  ${chalk.gray(s.model)}  ${s.title}`);
      }
      if (!list.length) console.log(chalk.gray("(no sessions yet)"));
      return false;
    }
    case "resume": {
      if (!arg) return void console.log(chalk.red("usage: /resume <id>")), false;
      const match = listSessions(cfg).find((s) => s.id.startsWith(arg));
      if (!match) return void console.log(chalk.red("no matching session")), false;
      setSession(loadSession(cfg, match.id));
      console.log(chalk.green(`→ resumed ${match.id.slice(0, 8)} (${match.title})`));
      return false;
    }
    case "new": {
      const s = newSession(cfg, arg || "Terminal session");
      saveSession(cfg, s);
      setSession(s);
      console.log(chalk.green(`→ new session ${s.id.slice(0, 8)}`));
      return false;
    }
    case "memory": {
      if (!arg) return void console.log(chalk.red("usage: /memory <note>")), false;
      appendMemory(cfg, arg);
      console.log(chalk.green("→ memory updated"));
      return false;
    }
    case "auto": {
      const [which, state] = arg.split(/\s+/);
      const on = state === "on";
      if (which === "writes") {
        cfg.autoApproveWrites = on;
        saveConfig({ autoApproveWrites: on });
      } else if (which === "shell") {
        cfg.autoApproveShell = on;
        saveConfig({ autoApproveShell: on });
      } else {
        console.log(chalk.red("usage: /auto writes|shell on|off"));
        return false;
      }
      console.log(chalk.green(`→ auto-${which}: ${on ? "on" : "off"}`));
      return false;
    }
    case "log": {
      for (const e of session.log.slice(-20))
        console.log(`  ${chalk.gray(e.time.slice(11, 19))} [${e.kind}] ${e.text.slice(0, 200)}`);
      return false;
    }
    default:
      console.log(chalk.red(`unknown command: /${cmd}`));
      return false;
  }
}
