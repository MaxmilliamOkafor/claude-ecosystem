import type Anthropic from "@anthropic-ai/sdk";

/**
 * Shared conversation types. Mirrors the Anthropic Messages API so they can be
 * forwarded directly to the SDK.
 */

export type Role = "user" | "assistant";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ type: "text"; text: string }>;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: Role;
  content: string | ContentBlock[];
}

export interface ChatRequest {
  model?: string;
  system?: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** If present, the tool runs locally (not passed to Anthropic). */
  local?: true;
}

export interface StreamEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "end" | "thinking";
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  error?: string;
}

export type AnthropicMessage = Anthropic.Messages.MessageParam;
