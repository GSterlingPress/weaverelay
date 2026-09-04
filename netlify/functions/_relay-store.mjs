import { scopedStore } from './_scoped-store.mjs';

const name = 'weaverelay-workspaces';
export function relayStore() { return scopedStore(name); }
export async function readWorkspace(id) { return relayStore().get(`workspace/${id}.json`, { type: 'json' }); }
export async function writeWorkspace(id, value) { await relayStore().setJSON(`workspace/${id}.json`, value); return value; }
