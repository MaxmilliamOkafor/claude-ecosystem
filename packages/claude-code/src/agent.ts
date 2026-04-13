import chalk from "chalk";
import prompts from "prompts";
import {
  CLAUDE_CODE_SYSTEM,
  chat,
  resolveModel,
  type Message,
  type ToolDefinition,
} from "@claude-eco/shared";
import type { Config } from "./config.js";
import { findTool, toolDefinitions, type ToolContext } from "./tools/index.js";
import { appendLog, saveSession, type Session } from "./session.js";
import { readMemory } from "./memory.js";

export interface AgentOptions {
  maxSteps?: number;
  onStep?: (label: string) => void;
}

export async function runAgentTurn(
  cfg: Config,
  session: Session,
  userText: string,
  opts: AgentOptions = {}
): Promise<string> {
  const maxSteps = opts.maxSteps ?? 16;

  // Seed the session with the user's message.
  session.messages.push({ role: "user", content: userText });
  appendLog(session, { kind: "user", text: userText });

  const memory = readMemory(cfg);
  const system = memory
    ? `${CLAUDE_CODE_SYSTEM}\n\n<project_memory>\n${memory}\n</project_memory>`
    : CLAUDE_CODE_SYSTEM;

  const toolCtx: ToolContext = {
    config: cfg,
    confirm: async (message, kind) => {
      const auto =
        (kind === "write" && cfg.autoApproveWrites) ||
        (kind === "shell" && cfg.autoApproveShell);
      if (auto) return;
      const res = await prompts({
        type: "confirm",
        name: "ok",
        message: chalk.yellow(`⚠ ${message}`),
        initial: false,
      });
      if (!res.ok) throw new Error("user declined");
    },
  };

  const tools: ToolDefinition[] = toolDefinitions();
  let finalText = "";

  for (let step = 0; step < maxSteps; step++) {
    opts.onStep?.(`thinking (step ${step + 1})`);
    const response = await chat({
      model: resolveModel(session.model).id,
      system,
      messages: session.messages,
      tools,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
    });

    session.messages.push({
      role: "assistant",
      content: response.content as any,
    });

    const toolUses = response.content.filter((b: any) => b.type === "tool_use");
    const texts = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    if (texts.trim()) {
      appendLog(session, { kind: "assistant", text: texts.trim() });
      finalText = texts.trim();
    }

    if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
      saveSession(cfg, session);
      return finalText;
    }

    // Execute tools in order, collect results, then feed back.
    const results: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];

    for (const tu of toolUses as Array<{ id: string; name: string; input: Record<string, unknown> }>) {
      opts.onStep?.(`tool: ${tu.name}`);
      const tool = findTool(tu.name);
      if (!tool) {
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `no such tool: ${tu.name}`,
          is_error: true,
        });
        continue;
      }
      try {
        const r = await tool.run(tu.input as any, toolCtx);
        appendLog(session, {
          kind: "tool",
          text: `${tu.name} → ${r.ok ? "ok" : "err"} (${r.content.length} bytes)`,
        });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: r.content,
          is_error: !r.ok,
        });
      } catch (err) {
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `tool error: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }

    session.messages.push({
      role: "user",
      content: results as any,
    } as Message);

    saveSession(cfg, session);
  }

  return finalText || "(agent hit max_steps without a final message)";
}
