import { readTicket } from './_relay-crypto.mjs';
import { readWorkspace } from './_workspace-store.mjs';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  let body; try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON.' }); }
  let claims; try { claims = readTicket(body.ticket); } catch (error) { return json(401, { error: error.message }); }
  const workspace = await readWorkspace(claims.workspaceId).catch(() => null);
  if (!workspace || workspace.clientId !== claims.clientId || workspace.siteOrigin !== claims.siteOrigin) return json(404, { error: 'Workspace not found.' });
  return json(200, { ok: true, workspace });
};
