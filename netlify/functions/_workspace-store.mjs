import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
const store=()=>getStore({name:'weaverelay-control-plane',consistency:'strong'});
export const id=()=>crypto.randomUUID();
export async function readWorkspace(workspaceId){return store().get(`workspace/${workspaceId}.json`,{type:'json',consistency:'strong'});}
export async function writeWorkspace(workspace){await store().setJSON(`workspace/${workspace.id}.json`,workspace);if(workspace.ownerId)await store().setJSON(`owner/${workspace.ownerId}/workspace/${workspace.id}.json`,{workspaceId:workspace.id,updatedAt:workspace.updatedAt||new Date().toISOString()});return workspace;}
export async function listWorkspaces(ownerId){const result=[];const prefix=`owner/${ownerId}/workspace/`;const {blobs=[]}=await store().list({prefix});for(const entry of blobs){const link=await store().get(entry.key,{type:'json'}).catch(()=>null);if(link?.workspaceId){const w=await readWorkspace(link.workspaceId).catch(()=>null);if(w)result.push(w);}}return result.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));}
export async function requireWorkspace(ownerId,workspaceId){const workspace=await readWorkspace(workspaceId).catch(()=>null);if(!workspace||workspace.ownerId!==ownerId){const error=new Error('Workspace not found.');error.status=404;throw error;}return workspace;}
export async function readConnection(workspaceId,provider){return store().get(`connection/${workspaceId}/${provider}.json`,{type:'json',consistency:'strong'});}
export async function writeConnection(workspaceId,provider,value){await store().setJSON(`connection/${workspaceId}/${provider}.json`,value);return value;}
export async function writeSecret(connectionId,value){await store().setJSON(`secret/${connectionId}.json`,value);}
export async function readSecret(connectionId){return store().get(`secret/${connectionId}.json`,{type:'json',consistency:'strong'});}
export async function writeOAuthState(hash,value){await store().setJSON(`oauth/${hash}.json`,value,{onlyIfNew:true});}
export async function consumeOAuthState(hash){const key=`oauth/${hash}.json`,value=await store().get(key,{type:'json',consistency:'strong'});if(value)await store().delete(key);return value;}

export async function deleteConnection(workspaceId,provider){await store().delete(`connection/${workspaceId}/${provider}.json`);}
export async function deleteSecret(connectionId){if(connectionId)await store().delete(`secret/${connectionId}.json`);}
