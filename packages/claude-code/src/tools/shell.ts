import { spawn } from "node:child_process";
import type { ToolHandler } from "./index.js";

const DANGER = [
  /\brm\s+-rf\s+\/(?!tmp|var\/tmp)/,
  /\bmkfs\b/,
  /\b:(\(\)\{\s*:\|:&\s*\};:)\b/,
  /\bdd\s+if=.+of=\/dev/,
  /\bchmod\s+-R\s+777\s+\//,
];

function isDangerous(cmd: string): boolean {
  return DANGER.some((r) => r.test(cmd));
}

export const runShell: ToolHandler = {
  definition: {
    name: "run_shell",
    description:
      "Run a shell command in the project's working directory. Use for builds, tests, git, package managers. Never use for `cat`, `ls`, `grep`, or `find` — prefer the dedicated tools.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute." },
        timeout_ms: { type: "number", description: "Optional timeout, default 120000." },
        cwd: { type: "string", description: "Optional working directory (relative to project root)." },
      },
      required: ["command"],
    },
    local: true,
  },
  async run(input, ctx) {
    const cmd = String(input.command).trim();
    if (!cmd) return { ok: false, content: "empty command" };
    if (isDangerous(cmd)) {
      return { ok: false, content: `refused: command matches a destructive pattern: ${cmd}` };
    }
    const timeout = Math.min(Math.max(1_000, Number(input.timeout_ms) || 120_000), 600_000);
    await ctx.confirm(`Run shell: ${cmd}`, "shell");

    const cwd = input.cwd ? String(input.cwd) : ctx.config.projectRoot;
    return new Promise((resolve) => {
      const child = spawn(cmd, { shell: true, cwd });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), timeout);

      child.stdout.on("data", (b) => (stdout += b.toString()));
      child.stderr.on("data", (b) => (stderr += b.toString()));

      child.on("close", (code) => {
        clearTimeout(timer);
        const out = [
          `$ ${cmd}`,
          stdout && `--- stdout ---\n${stdout.slice(-8000)}`,
          stderr && `--- stderr ---\n${stderr.slice(-4000)}`,
          `--- exit ${code} ---`,
        ]
          .filter(Boolean)
          .join("\n");
        resolve({ ok: code === 0, content: out, meta: { code } });
      });
    });
  },
};
