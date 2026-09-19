/**
 * Contract test for the repo-root Codex marketplace catalog
 * (.agents/plugins/marketplace.json) and its coherence with this plugin.
 *
 * These checks guard the `codex plugin marketplace add <owner>/OpenViking`
 * install path: the catalog must exist, be valid JSON, point at this plugin,
 * and the plugin's manifest / hooks / mcp wiring must stay consistent with the
 * marketplace-install assumptions (native ${PLUGIN_ROOT}, stdio MCP proxy,
 * no stale tool names).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(scriptsDir, "..");
const repoRoot = resolve(scriptsDir, "..", "..", "..");
const catalogPath = join(repoRoot, ".agents", "plugins", "marketplace.json");
const manifestPath = join(pluginDir, ".codex-plugin", "plugin.json");
const mcpEndpointPath = join(repoRoot, "openviking", "server", "mcp_endpoint.py");
const canonicalExperienceSkillPath = join(repoRoot, "examples", "skills", "ov-experience-memory", "SKILL.md");
const packagedExperienceSkillPath = join(pluginDir, "skills", "ov-experience-memory", "SKILL.md");

const PLUGIN_NAME = "openviking-memory";
const REAL_MCP_TOOLS = [
  "find", "search", "read", "list", "tree", "remember", "write", "edit",
  "add_resource", "list_watches", "cancel_watch", "grep", "glob", "forget", "health",
];
const LEGACY_TOOL_NAMES = ["openviking_recall", "openviking_store", "openviking_forget", "openviking_health"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Accept both the string form ("./examples/...") and local object forms
// ({source:"local",path}); return the ./-stripped path.
function sourcePath(source) {
  const raw = typeof source === "string" ? source : (source && typeof source === "object" ? source.path : "");
  return String(raw || "").replace(/^\.\//, "");
}

test("repo-root marketplace catalog exists and is valid JSON", () => {
  assert.ok(existsSync(catalogPath), `missing catalog at ${catalogPath}`);
  const catalog = readJson(catalogPath);
  assert.ok(typeof catalog.name === "string" && catalog.name.length > 0, "catalog.name must be a non-empty string");
  assert.ok(Array.isArray(catalog.plugins) && catalog.plugins.length > 0, "catalog.plugins must be a non-empty array");
});

test("catalog lists openviking-memory and its source points at this plugin dir", () => {
  const catalog = readJson(catalogPath);
  const entry = catalog.plugins.find((p) => p && p.name === PLUGIN_NAME);
  assert.ok(entry, `catalog must contain a plugin named "${PLUGIN_NAME}"`);

  const rel = sourcePath(entry.source);
  assert.ok(rel.endsWith("examples/codex-memory-plugin"), `source path must point at examples/codex-memory-plugin, got "${rel}"`);
  assert.equal(resolve(repoRoot, rel), pluginDir, "catalog source must resolve to this plugin directory");
});

test("catalog plugin name matches plugin.json name", () => {
  const catalog = readJson(catalogPath);
  const entry = catalog.plugins.find((p) => p && p.name === PLUGIN_NAME);
  const manifest = readJson(manifestPath);
  assert.equal(entry.name, manifest.name, "marketplace plugin name must equal plugin.json name");
});

test("catalog policy uses valid Codex install/auth enums", () => {
  const catalog = readJson(catalogPath);
  const entry = catalog.plugins.find((p) => p && p.name === PLUGIN_NAME);
  assert.ok(entry.policy, "plugin entry must declare a policy (Codex needs it to render install controls)");
  assert.ok(
    ["NOT_AVAILABLE", "AVAILABLE", "INSTALLED_BY_DEFAULT"].includes(entry.policy.installation),
    `invalid policy.installation: ${entry.policy.installation}`,
  );
  assert.ok(
    ["ON_INSTALL", "ON_USE"].includes(entry.policy.authentication),
    `invalid policy.authentication: ${entry.policy.authentication}`,
  );
});

test("catalog source is local to the marketplace snapshot", () => {
  const catalog = readJson(catalogPath);
  const entry = catalog.plugins.find((p) => p && p.name === PLUGIN_NAME);
  const src = entry.source;
  assert.ok(src, "catalog entry must declare a source");
  if (typeof src === "string") {
    assert.ok(src.startsWith("./"), `string source must be relative to the marketplace root, got "${src}"`);
  } else if (typeof src === "object") {
    assert.equal(src.source, "local", `object source must be a local source, got "${src.source}"`);
    for (const remote of ["url", "ref", "branch", "tag", "rev", "commit"]) {
      assert.ok(!(remote in src), `catalog source must not fetch a different Git repo/ref (found "${remote}")`);
    }
    assert.ok(typeof src.path === "string" && src.path.startsWith("./"), `object source path must be relative, got "${src.path}"`);
  } else {
    assert.fail(`unsupported catalog source type: ${typeof src}`);
  }
});

test("examples/.agents catalog backs the directory-marketplace install path", () => {
  // The shared installer registers examples/ itself as a local marketplace in
  // dev/archive mode, so a Codex catalog must exist there too and stay
  // consistent with the repo-root one (same marketplace name -> same plugin id
  // openviking-memory@openviking across all install modes).
  const localCatalogPath = join(repoRoot, "examples", ".agents", "plugins", "marketplace.json");
  assert.ok(existsSync(localCatalogPath), `missing catalog at ${localCatalogPath}`);
  const localCatalog = readJson(localCatalogPath);
  const rootCatalog = readJson(catalogPath);
  assert.equal(localCatalog.name, rootCatalog.name, "examples/.agents catalog must keep the same marketplace name as the repo root");
  const entry = localCatalog.plugins.find((p) => p && p.name === PLUGIN_NAME);
  assert.ok(entry, `examples/.agents catalog must contain "${PLUGIN_NAME}"`);
  assert.equal(resolve(repoRoot, "examples", sourcePath(entry.source)), pluginDir, "examples/.agents catalog source must resolve to this plugin directory");
});

test("required plugin files are present", () => {
  for (const rel of [
    ".codex-plugin/plugin.json",
    ".mcp.json",
    "hooks/hooks.json",
    "skills/ov-experience-memory/SKILL.md",
    "skills/openviking-memory/SKILL.md",
    "skills/ov-memory-doctor/SKILL.md",
    "skills/ov-memory-doctor/reference.md",
    "scripts/ov-memory-doctor.mjs",
    "scripts/shared/doctor-core.mjs",
  ]) {
    assert.ok(existsSync(join(pluginDir, rel)), `missing required plugin file: ${rel}`);
  }
});

test("marketplace package ships the canonical Experience skill", () => {
  assert.equal(
    readFileSync(packagedExperienceSkillPath, "utf-8"),
    readFileSync(canonicalExperienceSkillPath, "utf-8"),
    "packaged Experience skill must stay byte-identical to examples/skills/ov-experience-memory",
  );
});

test("plugin.json does not describe legacy MCP tool names", () => {
  const manifest = readJson(manifestPath);
  const interfaceText = JSON.stringify(manifest.interface || {});
  for (const legacy of LEGACY_TOOL_NAMES) {
    assert.ok(!interfaceText.includes(legacy), `plugin interface must not reference legacy tool name "${legacy}"`);
  }
});

test("hooks.json roots every command at ${CLAUDE_PLUGIN_ROOT}, the token both hosts expand", () => {
  const hooks = readFileSync(join(pluginDir, "hooks", "hooks.json"), "utf-8");
  assert.ok(!hooks.includes("__OPENVIKING_PLUGIN_ROOT__"), "hooks.json should not keep the legacy __OPENVIKING_PLUGIN_ROOT__ placeholder");
  // Claude Code expands only ${CLAUDE_PLUGIN_*}; Codex injects CLAUDE_PLUGIN_ROOT
  // next to PLUGIN_ROOT. A bare ${PLUGIN_ROOT} is empty under Claude Code.
  const parsed = JSON.parse(hooks);
  const commands = Object.values(parsed.hooks || {})
    .flat()
    .flatMap((group) => group.hooks || [])
    .map((h) => h.command || "");
  assert.ok(commands.length >= 5, "expected at least 5 hook commands (SessionStart/UserPromptSubmit/Stop/SessionEnd/PreCompact)");
  for (const cmd of commands) {
    assert.match(
      cmd,
      /^(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/[^"\n]+\.mjs"|sh "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/preflight\.sh")$/,
      `hook command must quote the \${CLAUDE_PLUGIN_ROOT} script path: ${cmd}`,
    );
  }
});

test("SessionStart checks for node from sh, in a group of its own", () => {
  const parsed = JSON.parse(readFileSync(join(pluginDir, "hooks", "hooks.json"), "utf-8"));
  const groups = parsed.hooks?.SessionStart || [];
  // The node-based hook stays the first group so its Codex trust record keeps its key.
  assert.match(groups[0]?.hooks?.[0]?.command || "", /session-start-commit\.mjs/);
  const preflight = groups.slice(1).flatMap((group) => group.hooks || []).filter((h) => /preflight\.sh/.test(h.command || ""));
  assert.equal(preflight.length, 1);
  assert.ok(preflight[0].command.startsWith("sh "), "the check must not need node to run");
  assert.ok(existsSync(join(pluginDir, "scripts", "preflight.sh")));
});

test("hooks.json covers compaction, subagents and viking:// URIs handed to local tools", () => {
  const hooks = JSON.parse(readFileSync(join(pluginDir, "hooks", "hooks.json"), "utf-8")).hooks;
  for (const group of hooks.SessionStart) assert.match(group.matcher, /\bcompact\b/);
  // A subagent's end runs the SessionEnd flow against the subagent's own session.
  assert.match(hooks.SubagentStop[0].hooks[0].command, /session-end\.mjs/);
  assert.match(hooks.PreToolUse[0].hooks[0].command, /uri-guard\.mjs/);
  assert.match(hooks.PreToolUse[0].matcher, /\bRead\b.*\bBash\b/);
});

test("hooks.json registers SessionEnd within Codex's clamped budget", () => {
  const parsed = JSON.parse(readFileSync(join(pluginDir, "hooks", "hooks.json"), "utf-8"));
  const entries = (parsed.hooks?.SessionEnd || []).flatMap((group) => group.hooks || []);
  assert.equal(entries.length, 1, "expected exactly one SessionEnd hook");
  assert.match(entries[0].command, /scripts\/session-end\.mjs/);
  // Codex clamps SessionEnd to 3s; anything larger is silently ignored.
  assert.ok(entries[0].timeout <= 3, `SessionEnd timeout must be <= 3, got ${entries[0].timeout}`);
});

test("Claude Code manifest leaves hooks to hooks/hooks.json auto-discovery", () => {
  const manifest = readJson(join(pluginDir, ".claude-plugin", "plugin.json"));
  assert.equal(manifest.name, PLUGIN_NAME);
  // Claude Code always loads hooks/hooks.json; naming it again in the manifest
  // is rejected as a duplicate, and a second hooks file would run every hook twice.
  assert.ok(!("hooks" in manifest), "Claude Code manifest must not declare hooks");
  assert.equal(manifest.skills, "./skills/");
});

test("skill text never spells a token that Claude Code expands", () => {
  // Claude Code replaces ${CLAUDE_PLUGIN_ROOT} in skill text with the install
  // path, so prose that means the token itself would show a path instead.
  const skillsDir = join(pluginDir, "skills");
  const files = readdirSync(skillsDir, { recursive: true }).filter((rel) => rel.endsWith(".md"));
  assert.ok(files.length > 0);
  for (const rel of files) {
    assert.ok(!readFileSync(join(skillsDir, rel), "utf-8").includes("${CLAUDE_PLUGIN_ROOT}"), `skills/${rel} spells \${CLAUDE_PLUGIN_ROOT}`);
  }
});

test("Claude Code MCP config roots the proxy at ${CLAUDE_PLUGIN_ROOT}", () => {
  const manifest = readJson(join(pluginDir, ".claude-plugin", "plugin.json"));
  const server = readJson(join(pluginDir, manifest.mcpServers)).mcpServers?.[PLUGIN_NAME];
  assert.ok(server, `Claude Code MCP config must define mcpServers["${PLUGIN_NAME}"]`);
  assert.equal(server.command, "node");
  // An absolute script path keeps the proxy independent of the launch cwd.
  assert.deepEqual(server.args, ["${CLAUDE_PLUGIN_ROOT}/servers/mcp-proxy.mjs"]);
});

test("Claude Code prompts for the connection, and every answer is optional", () => {
  const manifest = readJson(join(pluginDir, ".claude-plugin", "plugin.json"));
  assert.deepEqual(Object.keys(manifest.userConfig), ["url", "api_key", "account", "user"]);
  assert.equal(manifest.userConfig.api_key.sensitive, true);
  // A required prompt would block users who configure ~/.openviking/ovcli.conf instead.
  for (const option of Object.values(manifest.userConfig)) assert.notEqual(option.required, true);
});

test("the repository is not a marketplace of its own", () => {
  // The plugin is published through purisev/agent-plugins; a second marketplace
  // here would let one machine enable two copies and run every hook twice.
  assert.ok(!existsSync(join(pluginDir, ".claude-plugin", "marketplace.json")));
});

test(".mcp.json starts the stdio MCP proxy from the plugin root", () => {
  const mcp = readJson(join(pluginDir, ".mcp.json"));
  const server = mcp.mcpServers?.[PLUGIN_NAME];
  assert.ok(server, `.mcp.json must define mcpServers["${PLUGIN_NAME}"]`);
  assert.equal(server.command, "node");
  assert.deepEqual(server.args, ["servers/mcp-proxy.mjs"]);
  assert.equal(server.cwd, ".");
  assert.equal(server.startup_timeout_sec, 30);
  assert.ok(!("url" in server), ".mcp.json should not keep streamable-HTTP url wiring");
  assert.ok(!("bearer_token_env_var" in server), ".mcp.json should not require Codex env-var bearer wiring");

  execFileSync("node", ["--check", join(pluginDir, "servers", "mcp-proxy.mjs")], { stdio: "pipe" });
});

test("Codex MCP entrypoint forwards only native OpenViking tools", () => {
  const entrypoint = readFileSync(join(pluginDir, "servers", "mcp-proxy.mjs"), "utf-8");
  assert.doesNotMatch(entrypoint, /createExperienceToolProvider/);
  assert.doesNotMatch(entrypoint, /localToolProvider/);
  assert.match(entrypoint, /resolveMcpActorPeerId\(cfg\)/);
  assert.doesNotMatch(entrypoint, /resolveEffectivePeerId|process\.cwd\(\)/);
});

test("canonical MCP tool list matches server registrations", () => {
  const source = readFileSync(mcpEndpointPath, "utf-8");
  const registered = [
    ...source.matchAll(/@mcp\.tool\(([^)]*)\)\s*\nasync def ([a-z_]+)\(/g),
  ].map((match) => match[1].match(/(?:^|,\s*)name="([a-z_]+)"/)?.[1] || match[2]);
  assert.deepEqual(registered, REAL_MCP_TOOLS);
});

test("plugin.json declares the skills directory so Codex loads bundled skills", () => {
  const manifest = readJson(manifestPath);
  assert.equal(manifest.skills, "./skills/");
});

test("memory doctor script parses", () => {
  execFileSync("node", ["--check", join(pluginDir, "scripts", "ov-memory-doctor.mjs")], { stdio: "pipe" });
});
