import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCredentialFiles,
  resolveOpenVikingCredentials as resolveFromEnvAndFiles,
} from "./shared/credentials.mjs";

export { loadCredentialFiles } from "./shared/credentials.mjs";

// Claude Code hands the answers to the manifest's userConfig prompts to hooks
// and MCP servers as CLAUDE_PLUGIN_OPTION_<KEY>.
// Each option fills the first listed variable unless any spelling is already set.
const PLUGIN_OPTION_ENV = {
  CLAUDE_PLUGIN_OPTION_URL: ["OPENVIKING_URL", "OPENVIKING_BASE_URL"],
  CLAUDE_PLUGIN_OPTION_API_KEY: ["OPENVIKING_API_KEY", "OPENVIKING_BEARER_TOKEN"],
  CLAUDE_PLUGIN_OPTION_ACCOUNT: ["OPENVIKING_ACCOUNT"],
  CLAUDE_PLUGIN_OPTION_USER: ["OPENVIKING_USER"],
};

/**
 * An answered plugin option stands in for the matching OPENVIKING_* variable
 * when that variable is unset, so it takes the environment's place in the
 * credential precedence: above ovcli.conf, below an explicit variable. An
 * unanswered prompt changes nothing.
 */
export function withPluginOptions(env = process.env) {
  const merged = { ...env };
  for (const [option, variables] of Object.entries(PLUGIN_OPTION_ENV)) {
    const value = String(env[option] ?? "").trim();
    const alreadySet = variables.some((name) => String(env[name] ?? "").trim());
    if (value && !alreadySet) merged[variables[0]] = value;
  }
  return merged;
}

export function resolveOpenVikingCredentials(env = process.env) {
  return resolveFromEnvAndFiles(withPluginOptions(env));
}

function main() {
  const cmd = process.argv[2] || "";
  if (cmd === "mcp-url") {
    process.stdout.write(resolveOpenVikingCredentials().mcpUrl);
    return;
  }
  if (cmd === "has-api-key") {
    process.stdout.write(resolveOpenVikingCredentials().hasApiKey ? "1" : "0");
    return;
  }
  if (cmd === "has-peer-id") {
    process.stdout.write(resolveOpenVikingCredentials().peerId ? "1" : "0");
    return;
  }
  process.stderr.write("usage: ov-credentials.mjs <mcp-url|has-api-key|has-peer-id>\n");
  process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  main();
}
