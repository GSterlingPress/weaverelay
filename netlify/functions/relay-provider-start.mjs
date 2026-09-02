import { readTicket } from './_relay-crypto.mjs';
import { PROVIDERS } from './_provider-catalog.mjs';
import { readWorkspace } from './_relay-store.mjs';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  let body; try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON.' }); }
  let claims; try { claims = readTicket(body.ticket); } catch (error) { return json(401, { error: error.message }); }
  const provider = String(body.provider || '');
  if (!PROVIDERS[provider]) return json(400, { error: 'Unsupported provider.' });
  const workspace = await readWorkspace(claims.workspaceId).catch(() => null);
  if (!workspace) return json(404, { error: 'Workspace not found.' });
  const record = workspace.providers.find(item => item.id === provider);
  if (!record) return json(400, { error: 'Provider is not part of this workspace.' });
  if (record.status === 'connected') return json(200, { ok: true, state: 'already_connected', message: `${record.label} is already connected.` });
  return json(200, {
    ok: true,
    state: 'authorization_required',
    provider,
    authorization: PROVIDERS[provider].authorization,
    message: `${record.label} is ready for a least-privilege authorization adapter. The adapter is intentionally not activated until its provider app credentials and approved scopes are configured.`,
  });
};
