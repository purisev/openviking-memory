# Local session batching integration

Base: official OpenViking Codex memory plugin **0.8.3**, Git commit
`00e5e79da8caa6c255fd4c9c9b7633cf3b3a59fb` (official HEAD checked 2026-09-10).
The upstream web cache still reported 0.8.1; the fetched Git manifest is 0.8.3.
This repository is a local downstream copy; the upstream checkout is unchanged.

## Configuration

In the existing credential file `~/.openviking/ovcli.conf`, set
`plugin.codex.serverAutoCommit=true`, `commitTokenThreshold=20000`,
`commitKeepRecentCount=0`. Never copy credentials into this repository.
`OPENVIKING_SERVER_AUTO_COMMIT` overrides the boolean setting.
The feature defaults to false for compatibility with older servers.

Before message writes or commits, the common HTTP wrapper PATCHes the session's
`auto_commit_policy`. On 404 it creates the session with the policy; concurrent
creation (409) retries PATCH. Successful configuration is cached only within
the hook process. Failures stop the write without advancing the capture cursor.
SessionStart's recovery commit uses this wrapper too.

Server policy: pending threshold 20000, message count threshold 0, idle timeout
0, keep recent count 0, minimum interval 0. Server auto-commit on message writes
owns the threshold trigger; the plugin's duplicate Stop threshold commit is
disabled in this mode. SessionEnd/PreCompact/recovery commits remain enabled.
No global server default or idle scanner is enabled. Raw messages remain in
server session archives; retention 0 does not delete the archive.

The existing OpenViking 0.4.19 Phase 2 planner uses this policy to batch Working
Memory and long-term extraction. No server/model changes were made.

## Limits

- 20K is an estimate of message tokens, not a hard budget for the complete
  model request. System prompts, previous summaries, fetched facts and model
  tokenization add overhead. It is not an enforced 80% limit.
- A single oversized message is marked oversized, not split internally.
- The server's partial-turn checkpoint summary branch can bypass batching.
  This integration uses message-count retention 0, not partial-turn retention.
- A threshold schedules work; it does not guarantee immediate processing when
  another extraction job is running. Later writes/lifecycle commits retry.
- Already queued jobs retain their original policy snapshot.
- This patch covers Codex capture, not Claude Code's separate memory plugin.
  The independent wiki plugin and shared/private wiki rules are unchanged.

## Validation and deployment

Targeted unit/regression suites cover capture, configuration, policy creation,
retry/failure behavior, manual commit, session end, compaction, recovery,
credentials, MCP proxy and recall. See platform `docs/SESSION_BATCHING.md`.
Codex manifest normalization removes the unsupported `hooks` field (the default
`hooks/hooks.json` is discovered automatically) and adds `interface.defaultPrompt`.
The local doctor recognizes the personal marketplace and the new setting.

Install from the personal marketplace, with only one memory plugin enabled:
`codex plugin add openviking-memory@personal`.
Use the plugin-creator cachebuster helper after local changes, then reinstall.
A new Codex task picks up the new plugin/tool definitions; approve the five
lifecycle hooks in the native trust prompt if Codex requests it. Do not forge
or copy trust hashes from the old marketplace identity.

For upstream updates, import the pinned official plugin into a branch, reapply
the focused integration diff, and rerun tests before reinstalling. The suffix
`+codex.*` identifies this local build and does not claim an official release.
