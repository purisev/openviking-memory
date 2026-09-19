/**
 * Which agent host is running this plugin.
 *
 * One checkout serves Codex and Claude Code, and the hosts differ in where the
 * plugin's settings, log and manifest live.
 */

import { homedir } from "node:os";
import { join, resolve as resolvePath, sep } from "node:path";

export const HARNESSES = {
  codex: {
    id: "codex",
    label: "Codex",
    settingsKey: "codex",
    logFile: "codex-hooks.log",
    manifest: ".codex-plugin/plugin.json",
  },
  claudeCode: {
    id: "claude-code",
    label: "Claude Code",
    settingsKey: "claude_code",
    logFile: "cc-hooks.log",
    manifest: ".claude-plugin/plugin.json",
  },
};

export function isInside(path, dir) {
  const base = resolvePath(dir);
  return path === base || path.startsWith(base + sep);
}

export function claudeConfigDir(env = process.env, home = homedir()) {
  return env.CLAUDE_CONFIG_DIR || join(home, ".claude");
}

export function parseHarness(value) {
  const name = String(value || "").toLowerCase().replace(/_/g, "-");
  if (name === "codex") return HARNESSES.codex;
  if (name === "claude-code" || name === "claude" || name === "cc") return HARNESSES.claudeCode;
  return null;
}

/**
 * Precedence: an explicit choice; the plugin-root variables a host hands to the
 * hooks and MCP servers it spawns; the host plugin cache this copy lives in;
 * CLAUDECODE, which Claude Code exports to every child process. Anything else
 * is Codex.
 *
 * PLUGIN_ROOT is checked before CLAUDE_PLUGIN_ROOT because Codex sets both and
 * Claude Code sets only the latter. CLAUDECODE comes last because it is
 * inherited by any shell started inside Claude Code, including one that then
 * launches Codex.
 */
export function detectHarness({ explicit, pluginRoot, env = process.env, home = homedir() } = {}) {
  const chosen = parseHarness(explicit);
  if (chosen) return chosen;
  if (env.PLUGIN_ROOT) return HARNESSES.codex;
  if (env.CLAUDE_PLUGIN_ROOT) return HARNESSES.claudeCode;
  if (pluginRoot && isInside(pluginRoot, join(claudeConfigDir(env, home), "plugins"))) return HARNESSES.claudeCode;
  if (pluginRoot && isInside(pluginRoot, join(home, ".codex"))) return HARNESSES.codex;
  if (env.CLAUDECODE) return HARNESSES.claudeCode;
  return HARNESSES.codex;
}
