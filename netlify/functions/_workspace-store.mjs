import crypto from 'node:crypto';
import { scopedStore } from './_scoped-store.mjs';
const store=()=>scopedStore('weaverelay-control-plane');
export const id=()=>crypto.randomUUID();
export async function readWorkspace(workspaceId){return store().get(`workspace/${workspaceId}.json`,{type:'json'});}
export async function writeWorkspace(workspace){const s=store();await s.setJSON(`workspace/${workspace.id}.json`,workspace);if(workspace.ownerId)await s.setJSON(`owner/${workspace.ownerId}/workspace/${workspace.id}.json`,{workspaceId:workspace.id,updatedAt:workspace.updatedAt||new Date().toISOString()});return workspace;}
export async function listWorkspaces(ownerId){const result=[];const prefix=`owner/${ownerId}/workspace/`,s=store();const {blobs=[]}=await s.list({prefix});for(const entry of blobs){const link=await s.get(entry.key,{type:'json'}).catch(()=>null);if(link?.workspaceId){const w=await s.get(`workspace/${link.workspaceId}.json`,{type:'json'}).catch(()=>null);if(w)result.push(w);}}return result.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));}
export async function requireWorkspace(ownerId,workspaceId){const workspace=await readWorkspace(workspaceId).catch(()=>null);if(!workspace||workspace.ownerId!==ownerId){const error=new Error('Workspace not found.');error.status=404;throw error;}return workspace;}
export async function readConnection(workspaceId,provider){return store().get(`connection/${workspaceId}/${provider}.json`,{type:'json'});}
export async function writeConnection(workspaceId,provider,value){await store().setJSON(`connection/${workspaceId}/${provider}.json`,value);return value;}
export async function writeSecret(connectionId,value){await store().setJSON(`secret/${connectionId}.json`,value);}
export async function readSecret(connectionId){return store().get(`secret/${connectionId}.json`,{type:'json'});}
export async function writeOAuthState(hash,value){const s=store(),key=`oauth/${hash}.json`;if(await s.get(key,{type:'json'}))throw new Error('OAuth state already exists.');await s.setJSON(key,value);}
export async function consumeOAuthState(hash){const s=store(),key=`oauth/${hash}.json`,value=await s.get(key,{type:'json'});if(value)await s.delete(key);return value;}
export async function deleteConnection(workspaceId,provider){await store().delete(`connection/${workspaceId}/${provider}.json`);}
export async function deleteSecret(connectionId){if(connectionId)await store().delete(`secret/${connectionId}.json`);}
