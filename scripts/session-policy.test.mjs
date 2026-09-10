import test from 'node:test';
import assert from 'node:assert/strict';
import { withSessionPolicy } from './session-policy.mjs';

const cfg = { serverAutoCommit: true, commitTokenThreshold: 20000, commitKeepRecentCount: 0 };
const message = '/api/v1/sessions/cx-test/messages/batch';
function mock(results = []) {
  const calls = [];
  const fetch = withSessionPolicy(async (path, init) => {
    calls.push({ path, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    return results.shift() || { ok: true, status: 200 };
  }, cfg);
  return { calls, fetch };
}
test('policy is established before first write, cached, and covers commits', async () => {
  const { calls, fetch } = mock();
  await fetch(message, { method: 'POST' });
  await fetch('/api/v1/sessions/cx-test/commit', { method: 'POST' });
  assert.deepEqual(calls.map(x => x.method), ['PATCH', 'POST', 'POST']);
  assert.equal(calls[0].body.auto_commit_policy.pending_token_threshold, 20000);
  assert.equal(calls[0].body.auto_commit_policy.keep_recent_count, 0);
});
test('missing session is created with policy before sending messages', async () => {
  const { calls, fetch } = mock([{ ok: false, status: 404 }]);
  await fetch(message, { method: 'POST' });
  assert.equal(calls[1].path, '/api/v1/sessions');
  assert.equal(calls[1].body.session_id, 'cx-test');
  assert.equal(calls[2].path, message);
});
test('concurrent creation conflict reapplies policy', async () => {
  const { calls, fetch } = mock([{ ok: false, status: 404 }, { ok: false, status: 409 }]);
  await fetch(message, { method: 'POST' });
  assert.deepEqual(calls.map(x => x.method), ['PATCH', 'POST', 'PATCH', 'POST']);
});
test('policy errors stop writes and remain retryable on next attempt', async () => {
  const { calls, fetch } = mock([{ ok: false, status: 503 }]);
  assert.equal((await fetch(message, { method: 'POST' })).status, 503);
  assert.equal(calls.length, 1);
  await fetch(message, { method: 'POST' });
  assert.deepEqual(calls.map(x => x.method), ['PATCH', 'PATCH', 'POST']);
});
test('disabled feature and read-only requests do not configure anything', async () => {
  let n = 0;
  const fetch = withSessionPolicy(async () => { n++; return { ok: true }; }, { ...cfg, serverAutoCommit: false });
  await fetch(message, { method: 'POST' });
  assert.equal(n, 1);
  const active = mock();
  await active.fetch('/api/v1/sessions/cx-test', { method: 'GET' });
  assert.equal(active.calls.length, 1);
});
test('manual commit without any new messages also establishes policy', async () => {
  const { calls, fetch } = mock();
  await fetch('/api/v1/sessions/cx-old/commit', { method: 'POST' });
  assert.equal(calls[0].path, '/api/v1/sessions/cx-old/config');
});
