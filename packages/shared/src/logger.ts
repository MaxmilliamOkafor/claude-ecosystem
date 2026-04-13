/**
 * Tiny leveled logger — works in both Node and browser contexts.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): Level {
  const env =
    (typeof process !== "undefined" && process.env && process.env.ANTHROPIC_LOG) ||
    "info";
  const l = env.toLowerCase() as Level;
  return l in ORDER ? l : "info";
}

function log(level: Level, scope: string, ...args: unknown[]) {
  if (ORDER[level] < ORDER[currentLevel()]) return;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}]`;
  const fn =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(prefix, ...args);
}

export function createLogger(scope: string) {
  return {
    debug: (...a: unknown[]) => log("debug", scope, ...a),
    info: (...a: unknown[]) => log("info", scope, ...a),
    warn: (...a: unknown[]) => log("warn", scope, ...a),
    error: (...a: unknown[]) => log("error", scope, ...a),
  };
}
