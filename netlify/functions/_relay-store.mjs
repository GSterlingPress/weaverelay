import { getStore } from '@netlify/blobs';

const name = 'weaverelay-workspaces';
export function relayStore() { return getStore({ name, consistency: 'strong' }); }
export async function readWorkspace(id) { return relayStore().get(`workspace/${id}.json`, { type: 'json' }); }
export async function writeWorkspace(id, value) { await relayStore().setJSON(`workspace/${id}.json`, value); return value; }
