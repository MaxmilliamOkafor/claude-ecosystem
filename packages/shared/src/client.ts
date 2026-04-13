import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL_ID, resolveModel } from "./models.js";
import type { ChatRequest, StreamEvent } from "./types.js";

let _client: Anthropic | null = null;

export interface ClientOptions {
  apiKey?: string;
  baseURL?: string;
}

export function getClient(opts: ClientOptions = {}): Anthropic {
  if (_client) return _client;
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
    );
  }
  _client = new Anthropic({ apiKey, baseURL: opts.baseURL });
  return _client;
}

/**
 * Retry wrapper with exponential backoff for transient failures (429/5xx/network).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 750;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      const retriable = !status || status === 408 || status === 429 || status >= 500;
      if (!retriable || i === retries) break;
      const delay = Math.min(base * 2 ** i + Math.random() * 200, 15_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Non-streaming chat completion. Returns a plain Anthropic Message.
 */
export async function chat(req: ChatRequest): Promise<Anthropic.Messages.Message> {
  const client = getClient();
  const model = resolveModel(req.model ?? DEFAULT_MODEL_ID).id;
  return withRetry(() =>
    client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature,
      system: req.system,
      messages: req.messages as Anthropic.Messages.MessageParam[],
      tools: req.tools as Anthropic.Messages.Tool[] | undefined,
    })
  );
}

/**
 * Async-iterable streaming chat. Yields normalized StreamEvent values.
 */
export async function* streamChat(req: ChatRequest): AsyncGenerator<StreamEvent> {
  const client = getClient();
  const model = resolveModel(req.model ?? DEFAULT_MODEL_ID).id;

  const stream = client.messages.stream({
    model,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature,
    system: req.system,
    messages: req.messages as Anthropic.Messages.MessageParam[],
    tools: req.tools as Anthropic.Messages.Tool[] | undefined,
  });

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          yield { type: "text", text: delta.text };
        } else if (delta.type === "input_json_delta") {
          // partial tool input — ignored; we use final block on stop
        }
      } else if (event.type === "content_block_stop") {
        // handled by final message below
      }
    }
    const finalMessage = await stream.finalMessage();
    for (const block of finalMessage.content) {
      if (block.type === "tool_use") {
        yield {
          type: "tool_use",
          toolName: block.name,
          toolInput: block.input,
        };
      }
    }
    yield { type: "end" };
  } catch (err) {
    yield { type: "error", error: (err as Error).message };
  }
}
