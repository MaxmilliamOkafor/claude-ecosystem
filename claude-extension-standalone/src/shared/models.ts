/**
 * Canonical model list for the standalone extension. Models from every
 * supported backend live here so a single dropdown can pick any of them.
 */

export type Backend = "ollama" | "claudeai" | "anthropic";

export interface ModelEntry {
  id: string;
  label: string;
  backend: Backend;
  description: string;
}

/**
 * Ollama default tags shipped in common pulls. Users can add their own by
 * editing the "Local model" field in the options page. These are just the
 * presets populated into the selector.
 */
export const OLLAMA_PRESETS: ModelEntry[] = [
  { id: "llama3.2:latest", label: "Llama 3.2 (local)", backend: "ollama", description: "Fast. Runs locally via Ollama. No key, no limits." },
  { id: "llama3.1:8b", label: "Llama 3.1 8B (local)", backend: "ollama", description: "Solid everyday model. Runs locally." },
  { id: "qwen2.5:7b", label: "Qwen 2.5 7B (local)", backend: "ollama", description: "Strong reasoning and code. Runs locally." },
  { id: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder 7B (local)", backend: "ollama", description: "Coding-tuned. Runs locally." },
  { id: "mistral:latest", label: "Mistral 7B (local)", backend: "ollama", description: "Classic, fast. Runs locally." },
  { id: "phi3:mini", label: "Phi-3 Mini (local)", backend: "ollama", description: "Tiny, ultra-fast. Runs locally." },
];

export const CLAUDEAI_MODELS: ModelEntry[] = [
  { id: "claudeai-default", label: "Claude (via Claude.ai tab)", backend: "claudeai", description: "Opens Claude.ai with your prompt. Uses your existing claude.ai plan — no API key needed." },
];

export const ANTHROPIC_MODELS: ModelEntry[] = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", backend: "anthropic", description: "Most capable Claude. Requires Anthropic API key." },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", backend: "anthropic", description: "Balanced. Requires Anthropic API key." },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", backend: "anthropic", description: "Fastest. Requires Anthropic API key." },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5", backend: "anthropic", description: "Previous-gen Opus. Requires Anthropic API key." },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", backend: "anthropic", description: "Previous-gen Sonnet. Requires Anthropic API key." },
];

export const ALL_MODELS: ModelEntry[] = [...OLLAMA_PRESETS, ...CLAUDEAI_MODELS, ...ANTHROPIC_MODELS];

export const DEFAULT_MODEL_ID = "llama3.2:latest";
