import test from "node:test";
import assert from "node:assert/strict";

import { detectHarness, HARNESSES } from "./harness.mjs";

test("detectHarness: an explicit choice wins over location and environment", () => {
  const host = detectHarness({ explicit: "codex", pluginRoot: "/h/.claude/plugins/cache/x", env: { CLAUDECODE: "1" }, home: "/h" });
  assert.equal(host, HARNESSES.codex);
  assert.equal(detectHarness({ explicit: "claude_code", env: {}, home: "/h" }), HARNESSES.claudeCode);
});

test("detectHarness: a host's plugin cache decides before the environment", () => {
  assert.equal(detectHarness({ pluginRoot: "/h/.claude/plugins/cache/m/p/1.0", env: {}, home: "/h" }), HARNESSES.claudeCode);
  assert.equal(detectHarness({ pluginRoot: "/h/.codex/plugins/cache/m/p/1.0", env: { CLAUDECODE: "1" }, home: "/h" }), HARNESSES.codex);
  assert.equal(detectHarness({ pluginRoot: "/cfg/plugins/cache/m/p", env: { CLAUDE_CONFIG_DIR: "/cfg" }, home: "/h" }), HARNESSES.claudeCode);
});

test("detectHarness: a checkout follows the environment and defaults to Codex", () => {
  assert.equal(detectHarness({ pluginRoot: "/src/plugin", env: { CLAUDECODE: "1" }, home: "/h" }), HARNESSES.claudeCode);
  assert.equal(detectHarness({ pluginRoot: "/src/plugin", env: {}, home: "/h" }), HARNESSES.codex);
});

test("detectHarness: Codex sets PLUGIN_ROOT next to CLAUDE_PLUGIN_ROOT, Claude Code only the latter", () => {
  assert.equal(detectHarness({ env: { PLUGIN_ROOT: "/p", CLAUDE_PLUGIN_ROOT: "/p", CLAUDECODE: "1" }, home: "/h" }), HARNESSES.codex);
  assert.equal(detectHarness({ env: { CLAUDE_PLUGIN_ROOT: "/p" }, home: "/h" }), HARNESSES.claudeCode);
});

test("detectHarness: host-provided variables outrank the plugin location", () => {
  assert.equal(detectHarness({ pluginRoot: "/h/.claude/plugins/cache/m/p", env: { PLUGIN_ROOT: "/p" }, home: "/h" }), HARNESSES.codex);
});
