/**
 * Claude Code side of the memory doctor: whether Claude Code has this plugin
 * installed, enabled and able to run its hooks.
 *
 * Claude Code keeps no per-hook trust records, so the install check is about
 * the plugin registry (`claude plugin list --json`, else the files behind it),
 * the hook commands, and the settings switch that silences every hook.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { claudeConfigDir, isInside } from "./harness.mjs";
import { existsPath, homeShort, runCommand } from "./shared/doctor-core.mjs";

const PLUGIN_NAME = "openviking-memory";
const REQUIRED_PLUGIN_FILES = [".claude-plugin/plugin.json", "hooks/hooks.json", "servers/mcp-proxy.mjs", "scripts/config.mjs", "scripts/auto-recall.mjs", "scripts/auto-capture.mjs", "scripts/session-end.mjs", "scripts/ov-session.mjs"];
const INSTALL_FIX = "claude plugin marketplace add purisev/agent-plugins && claude plugin install openviking-memory@purisev";

function tryJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/** Hook commands that Claude Code cannot resolve to a script inside the plugin. */
export function unresolvableHookCommands(hooksConfig) {
  return Object.values(hooksConfig?.hooks || {})
    .flat()
    .flatMap((group) => group?.hooks || [])
    .map((hook) => hook?.command || "")
    .filter((command) => command && !command.includes("${CLAUDE_PLUGIN_ROOT}"));
}

/** Rows shaped like `claude plugin list --json`, rebuilt from the files behind it. */
export function readInstalledPlugins(configDir) {
  const installed = tryJson(join(configDir, "plugins", "installed_plugins.json"))?.plugins;
  if (!installed || typeof installed !== "object") return null;
  const enabled = tryJson(join(configDir, "settings.json"))?.enabledPlugins || {};
  return Object.entries(installed).flatMap(([id, installs]) =>
    (Array.isArray(installs) ? installs : []).map((install) => ({ ...install, id, enabled: enabled[id] === true })));
}

export function assessInstalledPlugins(rows, { version }) {
  const mine = (rows || []).filter((row) => String(row?.id || "").split("@")[0] === PLUGIN_NAME);
  if (!mine.length) {
    return [{
      level: "warn",
      message: `Claude Code has no installed ${PLUGIN_NAME} plugin`,
      detail: "only a session started with `claude --plugin-dir <checkout>` loads it",
      fix: INSTALL_FIX,
    }];
  }
  const findings = [];
  const enabled = mine.filter((row) => row.enabled !== false);
  for (const row of mine) {
    const where = `${row.id} ${row.version || "?"} (${row.scope || "?"} scope)`;
    if (row.enabled === false) findings.push({ level: "fail", message: `${where} is installed but disabled`, fix: `claude plugin enable ${row.id}` });
    else findings.push({ level: "ok", message: `${where} installed, enabled` });
    if (row.installPath && !existsPath(row.installPath)) findings.push({ level: "fail", message: "installed copy no longer exists on disk", detail: homeShort(row.installPath), fix: `claude plugin uninstall ${row.id} && claude plugin install ${row.id}` });
    else if (row.installPath) findings.push({ level: "info", message: `installed copy: ${homeShort(row.installPath)}` });
    for (const error of Array.isArray(row.errors) ? row.errors : []) findings.push({ level: "fail", message: `Claude Code reports a problem with ${row.id}`, detail: typeof error === "string" ? error : JSON.stringify(error), fix: "see the Errors tab of /plugin" });
    if (row.enabled !== false && row.version && version && row.version !== version) findings.push({ level: "warn", message: `installed plugin ${row.version} differs from this copy (${version})`, detail: "Claude Code runs hooks from the installed copy", fix: `claude plugin update ${row.id} and restart Claude Code` });
  }
  if (enabled.length > 1) findings.push({ level: "warn", message: `more than one copy of ${PLUGIN_NAME} is enabled`, detail: enabled.map((row) => `${row.id} (${row.scope || "?"})`).join(", "), fix: "disable the stale one or hooks fire twice" });
  return findings;
}

/**
 * Non-sensitive answers to the manifest's userConfig prompts, as Claude Code
 * stores them in user settings. Sensitive answers live in Claude Code's
 * credential store and reach only hooks and MCP servers.
 */
export function readPluginOptions(configDir) {
  const configs = tryJson(join(configDir, "settings.json"))?.pluginConfigs || {};
  const id = Object.keys(configs).find((key) => key.split("@")[0] === PLUGIN_NAME);
  const options = id ? configs[id]?.options : null;
  return options && typeof options === "object" ? options : {};
}

/**
 * The Bash tool does not receive CLAUDE_PLUGIN_OPTION_*, so a doctor started
 * from it would resolve a different connection than the hooks do. Returns the
 * option names it filled in.
 */
export function adoptPluginOptions(configDir, env = process.env) {
  const adopted = [];
  for (const [key, value] of Object.entries(readPluginOptions(configDir))) {
    const name = `CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`;
    if (env[name] !== undefined || value === "" || value == null) continue;
    env[name] = String(value);
    adopted.push(key);
  }
  return adopted;
}

/** Settings files in which `disableAllHooks` silences the plugin's hooks. */
export function settingsDisablingHooks(configDir, cwd = process.cwd()) {
  return [
    join(configDir, "settings.json"),
    join(cwd, ".claude", "settings.json"),
    join(cwd, ".claude", "settings.local.json"),
  ].filter((path) => tryJson(path)?.disableAllHooks === true);
}

export function checkClaudeCodeEnvironment(report) {
  const claude = runCommand("claude", ["--version"], { timeoutMs: 15000 });
  if (claude.ok) report.ok(`claude ${claude.stdout.split("\n")[0]}`);
  else report.info(`claude CLI not found on PATH (${claude.error || "?"}) — the plugin registry is read from disk instead`);
  return { claudeOnPath: claude.ok };
}

export function checkClaudeCodeInstall(report, { pluginRoot, claudeOnPath }) {
  report.section("Plugin install");
  const configDir = claudeConfigDir();
  const version = tryJson(join(pluginRoot, ".claude-plugin", "plugin.json"))?.version || "?";
  const inCache = isInside(pluginRoot, join(configDir, "plugins"));
  report.info(`running from ${homeShort(pluginRoot)} (version ${version}, ${inCache ? "plugin cache" : "checkout / --plugin-dir directory"})`);

  const missing = REQUIRED_PLUGIN_FILES.filter((rel) => !existsPath(join(pluginRoot, rel)));
  if (missing.length) report.fail("plugin files missing", missing.join(", "), "reinstall the plugin");
  else report.ok("plugin files present (manifest, hooks, MCP proxy, scripts)");

  const unresolvable = unresolvableHookCommands(tryJson(join(pluginRoot, "hooks", "hooks.json")));
  if (unresolvable.length) report.fail("hook commands are not rooted at ${CLAUDE_PLUGIN_ROOT}", unresolvable.join("\n"), "Claude Code expands no other plugin-root token; update the plugin");

  let rows = null;
  if (claudeOnPath) {
    const list = runCommand("claude", ["plugin", "list", "--json"], { timeoutMs: 30000 });
    try {
      rows = list.ok ? JSON.parse(list.stdout) : null;
    } catch { /* fall back to the registry files */ }
    if (!Array.isArray(rows)) report.info(`claude plugin list --json gave no usable list (${list.error || list.stderr.split("\n")[0] || "unparseable output"})`);
  }
  if (!Array.isArray(rows)) rows = readInstalledPlugins(configDir);
  if (!Array.isArray(rows)) report.warn(`no plugin registry under ${homeShort(configDir)}`, "Claude Code has never installed a plugin on this machine", INSTALL_FIX);
  else for (const f of assessInstalledPlugins(rows, { version })) report[f.level](f.message, f.detail, f.fix);

  const silenced = settingsDisablingHooks(configDir);
  if (silenced.length) report.fail("disableAllHooks is set", silenced.map(homeShort).join(", "), "remove disableAllHooks — no plugin hook fires while it is true");
  return {};
}
