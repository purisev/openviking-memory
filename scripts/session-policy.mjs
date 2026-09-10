// Local integration with OpenViking >= 0.4.19. No server patch required.
export function withSessionPolicy(fetchJSONRes, cfg) {
  const configured = new Set();
  const pending = new Map();
  async function ensure(encodedId) {
    if (configured.has(encodedId)) return { ok: true };
    if (pending.has(encodedId)) return pending.get(encodedId);
    const operation = (async () => {
      const policy = {
        pending_token_threshold: cfg.commitTokenThreshold,
        message_count_threshold: 0,
        idle_timeout_seconds: 0,
        keep_recent_count: cfg.commitKeepRecentCount,
        min_commit_interval_seconds: 0,
      };
      const path = `/api/v1/sessions/${encodedId}/config`;
      const init = { method: "PATCH", body: JSON.stringify({ auto_commit_policy: policy }) };
      let result = await fetchJSONRes(path, init);
      if (result.status === 404) {
        result = await fetchJSONRes('/api/v1/sessions', {
          method: 'POST',
          body: JSON.stringify({ session_id: decodeURIComponent(encodedId), auto_commit_policy: policy }),
        });
        if (result.status === 409) result = await fetchJSONRes(path, init);
      }
      if (result.ok) configured.add(encodedId);
      return result;
    })();
    pending.set(encodedId, operation);
    try { return await operation; } finally { pending.delete(encodedId); }
  }
  return async (path, init = {}) => {
    const match = path.match(/^\/api\/v1\/sessions\/([^/]+)\/(?:messages(?:\/batch)?|commit)$/);
    if (cfg.serverAutoCommit && match && init.method === 'POST') {
      const result = await ensure(match[1]);
      // Do not send unbounded work if configuring the policy failed. Capture's
      // existing cursor/retry mechanism will retain these unsent messages.
      if (!result.ok) return result;
    }
    return fetchJSONRes(path, init);
  };
}
