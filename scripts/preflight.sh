#!/bin/sh
# SessionStart check for the one tool every other hook and the MCP proxy need.
# Written in sh because it has to run exactly when node is missing.

MIN_NODE_MAJOR=18

report() {
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$1"
  exit 0
}

if ! command -v node >/dev/null 2>&1; then
  report "OpenViking memory is inactive: the node command is not on PATH, so the plugin hooks and its MCP server cannot start. Tell the user, and offer to install Node.js ${MIN_NODE_MAJOR} or newer (the current LTS is a good choice) with their consent; after installing, the host must be restarted."
fi

major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
case "$major" in
  ''|*[!0-9]*) exit 0 ;;
esac
if [ "$major" -lt "$MIN_NODE_MAJOR" ]; then
  report "OpenViking memory is inactive: node ${major} is on PATH, and the plugin needs Node.js ${MIN_NODE_MAJOR} or newer. Tell the user, and offer to upgrade Node.js with their consent; after upgrading, the host must be restarted."
fi
exit 0
