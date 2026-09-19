import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adoptPluginOptions,
  assessInstalledPlugins,
  readInstalledPlugins,
  settingsDisablingHooks,
  unresolvableHookCommands,
} from "./claude-code-install.mjs";

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

test("unresolvableHookCommands: flags commands without ${CLAUDE_PLUGIN_ROOT}", () => {
  const config = {
    hooks: {
      Stop: [{ hooks: [{ command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/auto-capture.mjs"' }] }],
      SessionEnd: [{ hooks: [{ command: 'node "${PLUGIN_ROOT}/scripts/session-end.mjs"' }] }],
    },
  };
  assert.deepEqual(unresolvableHookCommands(config), ['node "${PLUGIN_ROOT}/scripts/session-end.mjs"']);
  assert.deepEqual(unresolvableHookCommands(null), []);
});

test("unresolvableHookCommands: the shipped hooks.json resolves under Claude Code", () => {
  const shipped = JSON.parse(readFileSync(join(pluginDir, "hooks", "hooks.json"), "utf-8"));
  assert.deepEqual(unresolvableHookCommands(shipped), []);
});

test("readInstalledPlugins: joins the registry with enabledPlugins", () => {
  const configDir = mkdtempSync(join(tmpdir(), "ov-claude-"));
  assert.equal(readInstalledPlugins(configDir), null);
  writeJson(join(configDir, "plugins", "installed_plugins.json"), {
    version: 2,
    plugins: {
      "openviking-memory@openviking-memory": [{ scope: "user", installPath: "/p/1", version: "0.8.3" }],
      "other@m": [{ scope: "user", installPath: "/p/2", version: "1.0.0" }],
    },
  });
  writeJson(join(configDir, "settings.json"), { enabledPlugins: { "openviking-memory@openviking-memory": true } });
  assert.deepEqual(readInstalledPlugins(configDir), [
    { scope: "user", installPath: "/p/1", version: "0.8.3", id: "openviking-memory@openviking-memory", enabled: true },
    { scope: "user", installPath: "/p/2", version: "1.0.0", id: "other@m", enabled: false },
  ]);
});

test("assessInstalledPlugins: a missing plugin is a warning that names --plugin-dir", () => {
  const findings = assessInstalledPlugins([{ id: "other@m", enabled: true }], { version: "0.8.3" });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, "warn");
  assert.match(findings[0].detail, /--plugin-dir/);
  assert.match(findings[0].fix, /claude plugin install/);
});

test("assessInstalledPlugins: an enabled install on disk is ok", () => {
  const findings = assessInstalledPlugins([{ id: "openviking-memory@m", version: "0.8.3", scope: "user", enabled: true, installPath: pluginDir }], { version: "0.8.3" });
  assert.deepEqual(findings.map((f) => f.level), ["ok", "info"]);
});

test("assessInstalledPlugins: disabled, vanished and stale installs are reported", () => {
  const disabled = assessInstalledPlugins([{ id: "openviking-memory@m", version: "0.8.3", enabled: false }], { version: "0.8.3" });
  assert.equal(disabled[0].level, "fail");
  assert.equal(disabled[0].fix, "claude plugin enable openviking-memory@m");

  const vanished = assessInstalledPlugins([{ id: "openviking-memory@m", version: "0.8.3", enabled: true, installPath: join(pluginDir, "no-such-dir") }], { version: "0.8.3" });
  assert.ok(vanished.some((f) => f.level === "fail" && /no longer exists/.test(f.message)));

  const stale = assessInstalledPlugins([{ id: "openviking-memory@m", version: "0.8.2", enabled: true }], { version: "0.8.3" });
  assert.ok(stale.some((f) => f.level === "warn" && /differs from this copy/.test(f.message)));
});

test("assessInstalledPlugins: errors Claude Code attaches to the plugin are failures", () => {
  const findings = assessInstalledPlugins([{ id: "openviking-memory@m", version: "0.9.0", enabled: true, errors: ["Dependency \"x@m\" is not installed"] }], { version: "0.9.0" });
  const failure = findings.find((f) => f.level === "fail");
  assert.match(failure.detail, /is not installed/);
});

test("assessInstalledPlugins: two enabled copies would fire hooks twice", () => {
  const findings = assessInstalledPlugins([
    { id: "openviking-memory@a", version: "0.8.3", enabled: true },
    { id: "openviking-memory@b", version: "0.8.3", enabled: true },
  ], { version: "0.8.3" });
  assert.ok(findings.some((f) => f.level === "warn" && /more than one copy/.test(f.message)));
});

test("settingsDisablingHooks: finds disableAllHooks in user and project settings", () => {
  const configDir = mkdtempSync(join(tmpdir(), "ov-claude-"));
  const cwd = mkdtempSync(join(tmpdir(), "ov-project-"));
  assert.deepEqual(settingsDisablingHooks(configDir, cwd), []);
  writeJson(join(configDir, "settings.json"), { disableAllHooks: false });
  writeJson(join(cwd, ".claude", "settings.local.json"), { disableAllHooks: true });
  assert.deepEqual(settingsDisablingHooks(configDir, cwd), [join(cwd, ".claude", "settings.local.json")]);
});

test("adoptPluginOptions: fills unset option variables from Claude Code settings", () => {
  const configDir = mkdtempSync(join(tmpdir(), "ov-claude-"));
  writeJson(join(configDir, "settings.json"), {
    pluginConfigs: { "openviking-memory@purisev": { options: { url: "https://ov.example.com", account: "acme", user: "" } } },
  });
  const env = { CLAUDE_PLUGIN_OPTION_ACCOUNT: "from-host" };
  assert.deepEqual(adoptPluginOptions(configDir, env), ["url"]);
  assert.equal(env.CLAUDE_PLUGIN_OPTION_URL, "https://ov.example.com");
  assert.equal(env.CLAUDE_PLUGIN_OPTION_ACCOUNT, "from-host");
  assert.deepEqual(adoptPluginOptions(mkdtempSync(join(tmpdir(), "ov-claude-")), {}), []);
});
