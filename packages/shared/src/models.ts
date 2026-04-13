/**
 * Canonical list of Claude models supported across the ecosystem.
 *
 * Keep this list as the single source of truth — the CLI, Cowork web app, and
 * the browser extension all read it so that model switching stays consistent.
 */

export interface ClaudeModel {
  /** API model id — the exact value to pass to the Anthropic SDK. */
  id: string;
  /** Human-readable label shown in UIs. */
  label: string;
  /** Short descriptor shown next to the label. */
  description: string;
  /** Model family (used for grouping in selectors). */
  family: "opus" | "sonnet" | "haiku";
  /** Rough capability tier — higher = more capable. */
  tier: number;
  /** Supports vision / image inputs. */
  vision: boolean;
  /** Supports tool use (server-side tools and the SDK's tool_use API). */
  tools: boolean;
  /** Typical context window in tokens. */
  contextTokens: number;
}

export const MODELS: readonly ClaudeModel[] = [
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    description: "Most capable — best for complex reasoning, planning, and long coding sessions.",
    family: "opus",
    tier: 5,
    vision: true,
    tools: true,
    contextTokens: 200_000,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    description: "Balanced — high quality at faster latency, great daily driver.",
    family: "sonnet",
    tier: 4,
    vision: true,
    tools: true,
    contextTokens: 200_000,
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Fastest — great for extension popups and quick tasks.",
    family: "haiku",
    tier: 3,
    vision: true,
    tools: true,
    contextTokens: 200_000,
  },
  {
    id: "claude-opus-4-5",
    label: "Claude Opus 4.5",
    description: "Previous-generation Opus, broadly available.",
    family: "opus",
    tier: 4,
    vision: true,
    tools: true,
    contextTokens: 200_000,
  },
  {
    id: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    description: "Previous-generation Sonnet.",
    family: "sonnet",
    tier: 3,
    vision: true,
    tools: true,
    contextTokens: 200_000,
  },
] as const;

export const DEFAULT_MODEL_ID = "claude-opus-4-6";

export function resolveModel(idOrAlias?: string | null): ClaudeModel {
  if (!idOrAlias) return findModel(DEFAULT_MODEL_ID);
  const lower = idOrAlias.toLowerCase();
  const direct = MODELS.find((m) => m.id.toLowerCase() === lower);
  if (direct) return direct;
  const byLabel = MODELS.find((m) => m.label.toLowerCase() === lower);
  if (byLabel) return byLabel;
  // Alias support: "opus", "sonnet", "haiku" => latest in that family
  const fam = MODELS.filter((m) => m.family === lower).sort((a, b) => b.tier - a.tier)[0];
  if (fam) return fam;
  return findModel(DEFAULT_MODEL_ID);
}

function findModel(id: string): ClaudeModel {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model id: ${id}`);
  return m;
}

export function listModels(): ClaudeModel[] {
  return [...MODELS].sort((a, b) => b.tier - a.tier);
}
